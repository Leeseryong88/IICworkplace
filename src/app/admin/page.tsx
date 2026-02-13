"use client";
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth, emailSignIn, emailSignUp, resetPassword, signOut } from '@/lib/useAuth'
import { auth, db, storage } from '@/lib/firebase'
import type { Floor, FloorId, Zone, Category, Workspace, OverseasWork } from '@/lib/types'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes, deleteObject } from 'firebase/storage'
import DatePicker, { registerLocale } from 'react-datepicker'
import "react-datepicker/dist/react-datepicker.css"
import { format, parseISO, isValid, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, eachDayOfInterval, isSameMonth, isSameDay, isWithinInterval, addMonths, subMonths, differenceInCalendarDays } from 'date-fns'
import { ko } from 'date-fns/locale'

registerLocale('ko', ko)

const FLOORS: FloorId[] = ['5F', '6F', '7F']

const BRAND_CONFIG: Record<string, { name: string; color: string }> = {
  GM: { name: 'GM', color: '#0f172a' },   // 검정
  TAM: { name: 'TAM', color: '#eab308' }, // 노랑
  NUD: { name: 'NUD', color: '#ec4899' }, // 핑크
  ATS: { name: 'ATS', color: '#327fff' }, // 파랑
  NUF: { name: 'NUF', color: '#22c55e' }, // 초록
  LAB: { name: 'LAB', color: '#a855f7' }, // 보라
  ETC: { name: '기타', color: '#f97316' }, // 주황
}

export default function AdminPage() {
  const { user, loading } = useAuth()
  const allowedEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // 보안 개선: allowedEmails가 비어있으면 아무도 관리자가 될 수 없도록 수정
  const isAdmin = !!user && allowedEmails.length > 0 && allowedEmails.includes(user.email || '')

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('')
  const [zoneModalOpen, setZoneModalOpen] = useState(false)
  
  // 공용 기간 필터 상태 (작업실 관리와 구역 편집에서 공유)
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')

  // 하이드레이션 오류 방지를 위해 마운트 후 날짜 설정
  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    setFilterStart(today)
    setFilterEnd(today)
  }, [])

  // 상단 탭 상태 관리
  const [activeTab, setActiveTab] = useState<'workspaces' | 'all-zones' | 'overseas-work' | 'sidebar-settings'>('workspaces')

  if (!loading && !user) {
    return <EmailPasswordLogin />
  }

  if (!loading && user && !isAdmin) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-lg border bg-white p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">접근 권한 없음</h1>
          <Link href="/" className="text-sm text-brand-700 hover:underline">돌아가기</Link>
        </div>
        <p className="text-sm text-slate-600">관리자에게 권한을 요청하세요. (로그인: {user.email})</p>
        <button onClick={() => signOut()} className="rounded-md border px-3 py-1 text-sm">로그아웃</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* 관리자 헤더 */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-sm font-medium text-brand-700 hover:text-brand-800 transition-colors flex items-center gap-1">
                <span className="text-lg">←</span> 현황 보기
              </Link>
              <h1 className="text-xl font-bold text-slate-900 border-l pl-4 hidden sm:block">관리자 편집</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex flex-col items-end leading-tight text-sm">
                <span className="font-semibold text-slate-700">Admin</span>
                <span className="text-xs text-slate-500">{user?.email}</span>
              </div>
              <button 
                onClick={() => signOut()} 
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-red-600 active:scale-95"
              >
                로그아웃
              </button>
            </div>
          </div>

          {/* 상단 탭 (탑바) */}
          <nav className="flex space-x-1 sm:space-x-8 -mb-px">
            {[
              { id: 'workspaces', label: '🏢 작업실 관리', icon: '🏢' },
              { id: 'all-zones', label: '📋 작업실 사용 현황', icon: '📋' },
              { id: 'overseas-work', label: '🛠️ LAB본부 직접 설치 작업', icon: '🛠️' },
              { id: 'sidebar-settings', label: '⚙️ 사이드바 설정', icon: '⚙️' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`group flex items-center gap-2 py-4 px-1 border-b-2 font-bold text-sm transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* 메인 컨텐츠 영역 */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden min-h-[calc(100vh-200px)]">
          {activeTab === 'workspaces' && (
            <div className="animate-in fade-in duration-300">
              <div className="bg-slate-50 px-6 py-4 border-b">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="text-xl">🏢</span> 작업실 관리
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 ml-8">카테고리를 생성하고 도면 및 예약 구역을 설정합니다.</p>
              </div>
              <WorkspacesOverview
                selectedCategoryId={selectedCategoryId}
                setSelectedCategoryId={setSelectedCategoryId}
                setSelectedWorkspaceId={setSelectedWorkspaceId}
                openZoneEditor={(cid: string, wid: string) => { setSelectedCategoryId(cid); setSelectedWorkspaceId(wid); setZoneModalOpen(true) }}
                filterStart={filterStart}
                setFilterStart={setFilterStart}
                filterEnd={filterEnd}
                setFilterEnd={setFilterEnd}
              />
            </div>
          )}

          {activeTab === 'all-zones' && (
            <div className="animate-in fade-in duration-300">
              <div className="bg-slate-50 px-6 py-4 border-b">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="text-xl">📋</span> 작업실 사용 현황
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 ml-8">모든 작업실의 예약 현황을 통합 목록과 달력으로 확인합니다.</p>
              </div>
              <AllZonesList openZoneEditor={(cid: string, wid: string) => { setSelectedCategoryId(cid); setSelectedWorkspaceId(wid); setZoneModalOpen(true) }} />
            </div>
          )}

          {activeTab === 'overseas-work' && (
            <div className="animate-in fade-in duration-300">
              <div className="bg-slate-50 px-6 py-4 border-b">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="text-xl">🛠️</span> LAB본부 직접 설치 작업
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 ml-8">직접 설치 작업 현황 및 출장 계획을 관리합니다.</p>
              </div>
              <OverseasWorkList />
            </div>
          )}

          {activeTab === 'sidebar-settings' && (
            <div className="animate-in fade-in duration-300">
              <div className="bg-slate-50 px-6 py-4 border-b">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="text-xl">⚙️</span> 사이드바 설정
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 ml-8">메인 페이지 사이드바에 노출할 카테고리와 순서를 구성합니다.</p>
              </div>
              <SidebarSettings />
            </div>
          )}
        </div>
      </main>

      {zoneModalOpen && (
        <ZoneEditorModal 
          activeWorkspaceId={selectedWorkspaceId} 
          onClose={() => setZoneModalOpen(false)} 
          filterStart={filterStart}
          setFilterStart={setFilterStart}
          filterEnd={filterEnd}
          setFilterEnd={setFilterEnd}
        />
      )}
    </div>
  )
}

function AllZonesList({ openZoneEditor }: { openZoneEditor: (cid: string, wid: string) => void }) {
  const [zones, setZones] = useState<Zone[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentDate, setCurrentDate] = useState<Date | null>(null)
  const [viewingZone, setViewingZone] = useState<Zone | null>(null)

  useEffect(() => {
    setCurrentDate(new Date())
    // 실시간 데이터 구독
    const unsubZones = onSnapshot(query(collection(db, 'zones'), orderBy('updatedAt', 'desc')), (snap) => {
      const list: Zone[] = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as Zone))
      setZones(list)
    })
    const unsubWs = onSnapshot(collection(db, 'workspaces'), (snap) => {
      const list: Workspace[] = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as Workspace))
      setWorkspaces(list)
    })
    const unsubCats = onSnapshot(collection(db, 'categories'), (snap) => {
      const list: Category[] = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as Category))
      setCategories(list)
      setLoading(false)
    })

    return () => { unsubZones(); unsubWs(); unsubCats(); }
  }, [])

  const filteredZones = useMemo(() => {
    const filtered = zones.filter(z => {
      const ws = workspaces.find(w => w.id === z.workspaceId)
      const cat = categories.find(c => c.id === ws?.categoryId)
      
      // 브랜드 필터링
      if (selectedBrands.length > 0 && (!z.brand || !selectedBrands.includes(z.brand))) {
        return false
      }

      const searchStr = `${z.team || ''} ${z.name || ''} ${z.project || ''} ${z.manager || ''} ${z.brand || ''} ${ws?.name || ''} ${cat?.name || ''}`.toLowerCase()
      return searchStr.includes(searchTerm.toLowerCase())
    })

    // 시작일(startDate) 기준 정렬
    return [...filtered].sort((a, b) => {
      const dateA = a.startDate || ''
      const dateB = b.startDate || ''
      
      if (sortOrder === 'asc') {
        return dateA.localeCompare(dateB)
      } else {
        return dateB.localeCompare(dateA)
      }
    })
  }, [zones, workspaces, categories, selectedBrands, searchTerm, sortOrder])

  if (loading) return <div className="p-8 text-center text-slate-500">불러오는 중...</div>

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <input 
            type="text" 
            placeholder="팀명, 작업실, 카테고리 등으로 검색..." 
            className="w-full max-w-xs rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          
          <div className="flex flex-wrap items-center gap-1.5 border-l pl-4">
            <span className="text-xs font-semibold text-slate-400 mr-1">브랜드:</span>
            {Object.entries(BRAND_CONFIG).map(([key, cfg]) => {
              const isSelected = selectedBrands.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => {
                    setSelectedBrands(prev => 
                      isSelected ? prev.filter(b => b !== key) : [...prev, key]
                    )
                  }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all border-2 ${
                    isSelected 
                      ? 'border-slate-800 ring-1 ring-slate-100 shadow-sm' 
                      : 'border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  style={isSelected ? { backgroundColor: cfg.color, color: 'white' } : {}}
                >
                  {cfg.name}
                </button>
              )
            })}
            {selectedBrands.length > 0 && (
              <button 
                onClick={() => setSelectedBrands([])}
                className="ml-1 text-[11px] text-slate-400 hover:text-slate-600 underline"
              >
                초기화
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center rounded-lg border bg-slate-50 p-1">
          <button 
            onClick={() => setViewMode('list')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            목록
          </button>
          <button 
            onClick={() => setViewMode('calendar')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${viewMode === 'calendar' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            달력
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="rounded border bg-white overflow-hidden">
          <table className="w-full text-left table-fixed">
            <thead className="bg-slate-50 text-slate-600 font-medium text-[clamp(11px,1vw+2px,13px)]">
              <tr>
                <th className="px-3 py-2 border-b whitespace-nowrap w-[25%]">프로젝트명</th>
                <th className="px-2 py-2 border-b whitespace-nowrap w-[8%] text-center">브랜드</th>
                <th className="px-3 py-2 border-b whitespace-nowrap w-[12%]">카테고리</th>
                <th className="px-3 py-2 border-b whitespace-nowrap w-[10%]">작업실</th>
                <th className="px-3 py-2 border-b whitespace-nowrap w-[20%]">파트/팀</th>
                <th 
                  className="px-3 py-2 border-b cursor-pointer hover:bg-slate-100 transition-colors group w-[15%]"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  <div className="flex items-center gap-1">
                    기간
                    <span className={`text-[10px] transition-colors ${sortOrder === 'asc' ? 'text-brand-600' : 'text-slate-300 group-hover:text-slate-500'}`}>▲</span>
                    <span className={`text-[10px] transition-colors ${sortOrder === 'desc' ? 'text-brand-600' : 'text-slate-300 group-hover:text-slate-500'}`}>▼</span>
                  </div>
                </th>
                <th className="px-3 py-2 border-b whitespace-nowrap w-[10%]">담당자</th>
              </tr>
            </thead>
            <tbody className="divide-y text-[clamp(11px,1vw+2px,13px)]">
              {filteredZones.map(z => {
                const ws = workspaces.find(w => w.id === z.workspaceId)
                const cat = categories.find(c => c.id === ws?.categoryId)
                return (
                  <tr key={z.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-3 py-3 text-slate-700 font-medium whitespace-nowrap">
                      <div className="flex items-center justify-between gap-2 max-w-full">
                        <button 
                          onClick={() => setViewingZone(z)}
                          className="hover:text-brand-600 hover:underline transition-colors truncate"
                          title="상세 보기"
                        >
                          {z.project || z.name || '-'}
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); ws && openZoneEditor(ws.categoryId, ws.id) }}
                          className="opacity-0 group-hover:opacity-100 rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-700 hover:bg-brand-100 transition-all shrink-0"
                        >
                          편집
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-center">
                      <span 
                        className="inline-block px-2 py-0.5 rounded-full font-bold text-white whitespace-nowrap"
                        style={{ backgroundColor: z.color || '#327fff', fontSize: 'inherit' }}
                      >
                        {BRAND_CONFIG[z.brand || '']?.name || z.brand || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap truncate">{cat?.name || '-'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap truncate">{ws?.name || '-'}</td>
                    <td className="px-3 py-3 flex items-center gap-2 whitespace-nowrap truncate">
                      <span className="shrink-0 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: z.color || '#327fff' }} />
                      <span className="font-medium truncate">{z.team || z.name}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap truncate">
                      {z.startDate || '미정'} ~ {z.endDate || '미정'}
                    </td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap truncate">{z.manager || '-'}</td>
                  </tr>
                )
              })}
              {filteredZones.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    {searchTerm ? '검색 결과가 없습니다.' : '등록된 구역이 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <CalendarView 
          zones={filteredZones} 
          currentDate={currentDate} 
          setCurrentDate={setCurrentDate}
          workspaces={workspaces}
          onView={(z) => setViewingZone(z)}
        />
      )}

      {viewingZone && (
        <ZoneViewModal 
          zone={viewingZone} 
          onClose={() => setViewingZone(null)} 
          onEdit={() => {
            const ws = workspaces.find(w => w.id === viewingZone.workspaceId)
            if (ws) {
              setViewingZone(null)
              openZoneEditor(ws.categoryId, ws.id)
            }
          }}
        />
      )}
    </div>
  )
}

function CalendarView({ zones, currentDate, setCurrentDate, workspaces, onView }: { 
  zones: Zone[], 
  currentDate: Date | null, 
  setCurrentDate: (d: Date) => void,
  workspaces: Workspace[],
  onView: (z: Zone) => void
}) {
  if (!currentDate) return <div className="p-8 text-center text-slate-500">달력을 불러오는 중...</div>
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(monthStart)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = endOfWeek(monthEnd)

  const allDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  })

  const weeks: Date[][] = []
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7))
  }

  // 해당 달력 범위에 걸쳐 있는 구역들 필터링
  const monthZones = zones.filter(z => {
    if (!z.startDate || !z.endDate) return false
    const zStart = parseISO(z.startDate)
    const zEnd = parseISO(z.endDate)
    return (zStart <= calendarEnd) && (zEnd >= calendarStart)
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-700">
          {format(currentDate, 'yyyy년 MMMM', { locale: ko })}
        </h3>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="rounded border p-1 hover:bg-slate-50"
          >
            ◀
          </button>
          <button 
            onClick={() => setCurrentDate(new Date())}
            className="rounded border px-3 py-1 text-sm hover:bg-slate-50"
          >
            오늘
          </button>
          <button 
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="rounded border p-1 hover:bg-slate-50"
          >
            ▶
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b bg-slate-50 text-center text-xs font-semibold text-slate-500">
          {['일', '월', '화', '수', '목', '금', '토'].map(d => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="flex flex-col">
          {weeks.map((week, weekIdx) => {
            const weekStart = week[0]
            const weekEnd = week[6]

            // 이 주에 걸쳐 있는 구역들
            const weekZones = monthZones.filter(z => {
              const zs = parseISO(z.startDate!)
              const ze = parseISO(z.endDate!)
              return zs <= weekEnd && ze >= weekStart
            })

            // 행 배정
            const rows: Zone[][] = []
            // 시작일이 빠른 순서대로 정렬하여 행 배정의 일관성 향상
            const sortedWeekZones = [...weekZones].sort((a, b) => {
              const as = a.startDate || ''
              const bs = b.startDate || ''
              return as.localeCompare(bs)
            })

            sortedWeekZones.forEach(z => {
              let assigned = false
              for (let i = 0; i < rows.length; i++) {
                const canPlace = rows[i].every(rz => {
                  const rzs = parseISO(rz.startDate!); const rze = parseISO(rz.endDate!)
                  const zs = parseISO(z.startDate!); const ze = parseISO(z.endDate!)
                  return ze < rzs || zs > rze
                })
                if (canPlace) {
                  rows[i].push(z)
                  assigned = true
                  break
                }
              }
              if (!assigned) rows.push([z])
            })

            return (
              <div key={weekIdx} className="relative border-b last:border-b-0 min-h-[120px]">
                {/* 배경 날짜 칸 */}
                <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                  {week.map((day, dayIdx) => {
                    const isCurrentMonth = isSameMonth(day, monthStart)
                    const isToday = isSameDay(day, new Date())
                    return (
                      <div key={dayIdx} className={`border-r p-1 ${!isCurrentMonth ? 'bg-slate-50/25' : 'bg-white'} ${dayIdx === 6 ? 'border-r-0' : ''}`}>
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                          isToday ? 'bg-brand-600 text-white' : isCurrentMonth ? 'text-slate-700' : 'text-slate-300'
                        }`}>
                          {format(day, 'd')}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {/* 구역 바 레이어 */}
                <div className="relative pt-8 pb-2 px-0.5 space-y-1">
                  {rows.slice(0, 6).map((row, rowIdx) => (
                    <div key={rowIdx} className="grid grid-cols-7 h-5 relative">
                      {row.map(z => {
                        const zs = parseISO(z.startDate!)
                        const ze = parseISO(z.endDate!)
                        const start = Math.max(0, differenceInCalendarDays(zs, weekStart))
                        const end = Math.min(6, differenceInCalendarDays(ze, weekStart))
                        const colStart = start + 1
                        const colSpan = end - start + 1
                        
                        const isAbsoluteStart = zs >= weekStart && zs <= weekEnd
                        const isAbsoluteEnd = ze >= weekStart && ze <= weekEnd

                        return (
                          <div 
                            key={z.id}
                            className="pointer-events-auto cursor-pointer text-[10px] flex items-center relative h-5 mx-0.5"
                            style={{ 
                              gridColumn: `${colStart} / span ${colSpan}`,
                            }}
                            title={`${z.project || '프로젝트'} | ${z.team || z.name} (${z.startDate} ~ ${z.endDate})`}
                            onClick={() => onView(z)}
                          >
                            {/* 연결 실 (나머지 일) */}
                            <div 
                              className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 opacity-60"
                              style={{ backgroundColor: z.color || '#327fff' }}
                            />
                            
                            {/* 시작일 바 */}
                            {isAbsoluteStart && (
                              <div 
                                className="absolute top-0 bottom-0 rounded shadow-sm flex items-center justify-center z-10"
                                style={{ 
                                  left: '0',
                                  width: `${100 / colSpan}%`,
                                  backgroundColor: z.color || '#327fff'
                                }}
                              >
                                <span className="text-white font-bold truncate px-1 text-[9px]">
                                  {z.project || z.team || z.name}
                                </span>
                              </div>
                            )}

                            {/* 종료일 바 (시작일과 겹치지 않을 때만 텍스트 표시 가능) */}
                            {isAbsoluteEnd && (
                              <div 
                                className="absolute top-0 bottom-0 rounded shadow-sm flex items-center justify-center z-10"
                                style={{ 
                                  right: '0',
                                  width: `${100 / colSpan}%`,
                                  backgroundColor: z.color || '#327fff'
                                }}
                              >
                                {(!isAbsoluteStart || colSpan > 1) && (
                                  <span className="text-white font-bold truncate px-1 text-[9px]">
                                    {isAbsoluteStart ? '종료' : (z.project || z.team || z.name)}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* 텍스트 (기간이 길어 바가 없는 중간 영역에만 표시) */}
                            {!isAbsoluteStart && !isAbsoluteEnd && (
                              <div className="w-full text-center relative z-0">
                                <span 
                                  className="px-1 rounded-sm text-[9px] font-medium"
                                  style={{ color: z.color || '#327fff', backgroundColor: 'white', border: `1px solid ${z.color || '#327fff'}20` }}
                                >
                                  {z.project || z.team || z.name}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                  {rows.length > 6 && (
                    <div className="text-[10px] text-slate-400 pl-2 font-medium">
                      + {rows.length - 6}개 더보기
                    </div>
                  )}
                  {rows.length === 0 && <div className="h-12" />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function OverseasWorkList() {
  const [items, setItems] = useState<OverseasWork[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [selectedWorkTypes, setSelectedWorkTypes] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [currentDate, setCurrentDate] = useState<Date | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [viewingItem, setViewingItem] = useState<OverseasWork | null>(null)
  const [editingItem, setEditingItem] = useState<Partial<OverseasWork> | null>(null)
  const [inlineDateEditId, setInlineDateEditId] = useState<string | null>(null)
  const [inlineRange, setInlineRange] = useState<[Date | null, Date | null]>([null, null])
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    setCurrentDate(new Date())
    const unsub = onSnapshot(query(collection(db, 'overseas_work'), orderBy('updatedAt', 'desc')), (snap) => {
      const list: OverseasWork[] = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as OverseasWork))
      setItems(list)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (selectedBrands.length > 0 && !selectedBrands.includes(item.brand)) return false
      if (selectedWorkTypes.length > 0 && (!item.workType || !selectedWorkTypes.includes(item.workType))) return false
      const searchStr = `${item.workType || ''} ${item.projectName} ${item.location} ${item.manager} ${item.content} ${item.brand}`.toLowerCase()
      return searchStr.includes(searchTerm.toLowerCase())
    })
  }, [items, selectedBrands, selectedWorkTypes, searchTerm])

  const handleSave = async (data: Partial<OverseasWork>) => {
    try {
      const payload = {
        ...data,
        updatedAt: Date.now()
      }
      if (data.id) {
        const { id, ...rest } = payload
        await updateDoc(doc(db, 'overseas_work', id!), rest)
      } else {
        await addDoc(collection(db, 'overseas_work'), payload)
      }
      setModalOpen(false)
      setEditingItem(null)
    } catch (e) {
      console.error(e)
      alert('저장 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'overseas_work', id))
      } catch (e) {
        console.error(e)
        alert('삭제 중 오류가 발생했습니다.')
      }
    }
  }

  const handleInlineDateSave = async (id: string) => {
    const [start, end] = inlineRange
    if (!start || !end) {
      alert('시작일과 종료일을 모두 선택해주세요.')
      return
    }
    try {
      await updateDoc(doc(db, 'overseas_work', id), {
        startDate: format(start, 'yyyy-MM-dd'),
        endDate: format(end, 'yyyy-MM-dd'),
        updatedAt: Date.now()
      })
      setInlineDateEditId(null)
      setInlineRange([null, null])
    } catch (e) {
      console.error(e)
      alert('저장 중 오류가 발생했습니다.')
    }
  }

  if (loading) return <div className="p-8 text-center text-slate-500">불러오는 중...</div>

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <input 
            type="text" 
            placeholder="지역, 프로젝트, 장소, 담당자 등으로 검색..." 
            className="w-full max-w-xs rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          
          <div className="flex flex-wrap items-center gap-1.5 border-l pl-4">
            <span className="text-xs font-semibold text-slate-400 mr-1">브랜드:</span>
            {Object.entries(BRAND_CONFIG).filter(([key]) => key !== 'LAB').map(([key, cfg]) => {
              const isSelected = selectedBrands.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => {
                    setSelectedBrands(prev => 
                      isSelected ? prev.filter(b => b !== key) : [...prev, key]
                    )
                  }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all border-2 ${
                    isSelected 
                      ? 'border-slate-800 ring-1 ring-slate-100 shadow-sm' 
                      : 'border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  style={isSelected ? { backgroundColor: cfg.color, color: 'white' } : {}}
                >
                  {cfg.name}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-l pl-4">
            <span className="text-xs font-semibold text-slate-400 mr-1">지역:</span>
            {['국내', '해외'].map((type) => {
              const isSelected = selectedWorkTypes.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedWorkTypes(prev => 
                      isSelected ? prev.filter(t => t !== type) : [...prev, type]
                    )
                  }}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all border-2 ${
                    isSelected 
                      ? 'bg-slate-800 border-slate-800 text-white shadow-sm' 
                      : 'border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {type}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border bg-slate-50 p-1">
            <button 
              onClick={() => setViewMode('list')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              목록
            </button>
            <button 
              onClick={() => setViewMode('calendar')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${viewMode === 'calendar' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              달력
            </button>
          </div>
          <button 
            onClick={() => { setEditingItem(null); setModalOpen(true); }}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-md transition-all hover:bg-brand-700 active:scale-95"
          >
            + 새 작업 등록
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="rounded border bg-white overflow-hidden">
          <table className="overseas-work-table w-full text-left table-fixed">
            <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                <th className="px-2 py-2 border-b whitespace-nowrap w-[5%]">지역</th>
                <th className="px-3 py-2 border-b whitespace-nowrap w-[40%]">프로젝트명</th>
                <th className="px-2 py-2 border-b whitespace-nowrap w-[8%] text-center">브랜드</th>
                <th className="px-3 py-2 border-b whitespace-nowrap w-[25%]">작업 장소</th>
                <th className="px-2 py-2 border-b whitespace-nowrap w-[8%]">담당자</th>
                <th className="px-2 py-2 border-b whitespace-nowrap w-[14%]">출장 계획</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredItems.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-2 py-3 text-slate-600 whitespace-nowrap">
                    <span className={`inline-block px-1.5 py-0.5 rounded font-bold ${item.workType === '해외' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`} style={{ fontSize: 'inherit' }}>
                      {item.workType || '국내'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-700 font-medium whitespace-nowrap">
                    <div className="flex items-center justify-between gap-2 max-w-full">
                      <button 
                        onClick={() => setViewingItem(item)}
                        className="hover:text-brand-600 hover:underline transition-colors flex items-center gap-1.5 overflow-hidden"
                        title="상세 보기"
                      >
                        {item.attachments && item.attachments.length > 0 && (
                          <span className="shrink-0 text-brand-600 font-bold">📎</span>
                        )}
                        <span className="truncate">{item.projectName}</span>
                      </button>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEditingItem(item); setModalOpen(true); }}
                          className="rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-700 hover:bg-brand-100"
                          title="수정"
                        >
                          수정
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); item.id && handleDelete(item.id); }}
                          className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700 hover:bg-red-100"
                          title="삭제"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap text-center">
                    <span 
                      className="inline-block px-2 py-0.5 rounded-full font-bold text-white"
                      style={{ backgroundColor: BRAND_CONFIG[item.brand]?.color || '#327fff', fontSize: 'inherit' }}
                    >
                      {BRAND_CONFIG[item.brand]?.name || item.brand}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap truncate" title={item.location}>{item.location}</td>
                  <td className="px-2 py-3 text-slate-600 whitespace-nowrap truncate">{item.manager}</td>
                  <td className="px-2 py-3 text-slate-500 relative whitespace-nowrap overflow-visible">
                    {inlineDateEditId === item.id ? (
                      <div 
                        className="fixed z-[100] bg-white shadow-2xl border border-slate-200 rounded-xl p-3 animate-in fade-in zoom-in duration-200"
                        style={{ 
                          top: `${popoverPos.top}px`, 
                          left: `${popoverPos.left}px`,
                          transform: popoverPos.left > window.innerWidth - 300 ? 'translateX(-100%)' : 'none'
                        }}
                      >
                        <div className="mb-2 text-[11px] font-bold text-slate-700 flex justify-between items-center">
                          <span>기간 선택</span>
                          <span className="text-brand-600">
                            {inlineRange[0] ? format(inlineRange[0], 'MM.dd') : ''} 
                            {inlineRange[1] ? ` ~ ${format(inlineRange[1], 'MM.dd')}` : ''}
                          </span>
                        </div>
                        <DatePicker
                          selectsRange
                          startDate={inlineRange[0]}
                          endDate={inlineRange[1]}
                          onChange={(update: [Date | null, Date | null]) => setInlineRange(update)}
                          inline
                          locale="ko"
                        />
                        <div className="mt-3 flex justify-end gap-2">
                          <button 
                            onClick={() => { setInlineDateEditId(null); setInlineRange([null, null]); }}
                            className="px-3 py-1.5 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 font-medium transition-colors"
                          >
                            취소
                          </button>
                          <button 
                            onClick={() => handleInlineDateSave(item.id)}
                            className="px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium shadow-sm transition-all active:scale-95"
                          >
                            기간 저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      item.startDate && item.endDate ? (
                        <div className="flex items-center gap-1 group inline-flex max-w-full overflow-hidden truncate">
                          <span className="truncate text-[0.9em]">{item.startDate} ~ {item.endDate}</span>
                          <button 
                            onClick={(e) => { 
                              const rect = e.currentTarget.getBoundingClientRect();
                              setPopoverPos({ top: rect.bottom + 8, left: rect.left });
                              setInlineDateEditId(item.id!); 
                              setInlineRange([parseISO(item.startDate), parseISO(item.endDate)]); 
                            }}
                            className="opacity-0 group-hover:opacity-100 text-brand-600 hover:underline transition-opacity shrink-0"
                          >
                            📝
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={(e) => { 
                            const rect = e.currentTarget.getBoundingClientRect();
                            setPopoverPos({ top: rect.bottom + 8, left: rect.left });
                            setInlineDateEditId(item.id!); 
                            setInlineRange([new Date(), new Date()]); 
                          }}
                          className="text-brand-600 hover:text-brand-700 hover:underline font-bold flex items-center gap-1 text-[0.9em]"
                        >
                          📅 지정
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    등록된 작업 현황이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <DirectWorkCalendarView 
          items={filteredItems} 
          currentDate={currentDate} 
          setCurrentDate={setCurrentDate}
          onView={(item) => setViewingItem(item)}
        />
      )}

      {modalOpen && (
        <OverseasWorkModal 
          item={editingItem} 
          onClose={() => setModalOpen(false)} 
          onSave={handleSave} 
        />
      )}

      {viewingItem && (
        <WorkViewModal 
          item={viewingItem} 
          onClose={() => setViewingItem(null)} 
          onEdit={() => { 
            const item = viewingItem;
            setViewingItem(null); 
            setEditingItem(item); 
            setModalOpen(true); 
          }}
          onDelete={() => {
            if (viewingItem.id && confirm('정말 삭제하시겠습니까?')) {
              handleDelete(viewingItem.id);
              setViewingItem(null);
            }
          }}
        />
      )}
    </div>
  )
}

function OverseasWorkModal({ item, onClose, onSave }: { item: Partial<OverseasWork> | null, onClose: () => void, onSave: (data: Partial<OverseasWork>) => void }) {
  const [hasPeriod, setHasPeriod] = useState(!!(item?.startDate && item?.endDate))
  const [uploading, setUploading] = useState(false)
  const [formData, setFormData] = useState<Partial<OverseasWork>>(item || {
    projectName: '',
    brand: 'GM',
    location: '',
    manager: '',
    content: '',
    workType: '국내',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    attachments: [],
  })

  const handleSubmit = () => {
    if (uploading) return
    const dataToSave = { ...formData }
    if (!hasPeriod) {
      dataToSave.startDate = ''
      dataToSave.endDate = ''
    }
    onSave(dataToSave)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    const newAttachments = [...(formData.attachments || [])]

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const timestamp = Date.now()
        const storageRef = ref(storage, `overseas_work_attachments/${timestamp}_${file.name}`)
        const snapshot = await uploadBytes(storageRef, file)
        const url = await getDownloadURL(snapshot.ref)
        newAttachments.push({ name: file.name, url })
      }
      setFormData({ ...formData, attachments: newAttachments })
    } catch (error) {
      console.error('File upload error:', error)
      alert('파일 업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const removeAttachment = (index: number) => {
    const newAttachments = [...(formData.attachments || [])]
    newAttachments.splice(index, 1)
    setFormData({ ...formData, attachments: newAttachments })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-5xl rounded-xl bg-white p-6 shadow-xl animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">
            {item?.id ? '작업 수정' : '작업 등록'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 왼쪽 컬럼: 기본 정보 */}
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">지역</label>
                <select 
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={formData.workType}
                  onChange={e => setFormData({...formData, workType: e.target.value as any})}
                >
                  <option value="국내">국내</option>
                  <option value="해외">해외</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">프로젝트명</label>
                <input 
                  type="text" 
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" 
                  value={formData.projectName}
                  onChange={e => setFormData({...formData, projectName: e.target.value})}
                  placeholder="예: Project Name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">브랜드</label>
                <select 
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={formData.brand}
                  onChange={e => setFormData({...formData, brand: e.target.value})}
                >
                  {Object.keys(BRAND_CONFIG).filter(key => key !== 'LAB').map(key => (
                    <option key={key} value={key}>{BRAND_CONFIG[key].name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">담당자</label>
                <input 
                  type="text" 
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" 
                  value={formData.manager}
                  onChange={e => setFormData({...formData, manager: e.target.value})}
                  placeholder="담당자 이름"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">작업 장소</label>
              <input 
                type="text" 
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" 
                value={formData.location}
                onChange={e => setFormData({...formData, location: e.target.value})}
                placeholder="예: 서울, Paris, etc."
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-500">출장 계획</label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={hasPeriod} 
                    onChange={e => setHasPeriod(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xs font-medium text-slate-600">기간 입력</span>
                </label>
              </div>
              {hasPeriod && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <DatePicker
                    selected={formData.startDate ? parseISO(formData.startDate) : new Date()}
                    onChange={(date) => setFormData({ ...formData, startDate: format(date || new Date(), 'yyyy-MM-dd') })}
                    dateFormat="yyyy-MM-dd"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    locale="ko"
                  />
                  <span className="text-slate-400">~</span>
                  <DatePicker
                    selected={formData.endDate ? parseISO(formData.endDate) : new Date()}
                    onChange={(date) => setFormData({ ...formData, endDate: format(date || new Date(), 'yyyy-MM-dd') })}
                    dateFormat="yyyy-MM-dd"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    locale="ko"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">첨부 자료 (도면, 랜더링 등)</label>
              <div className="flex flex-col gap-2">
                <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 py-4 text-sm text-slate-500 hover:border-brand-300 hover:text-brand-600 transition-colors">
                  <span className="text-lg">📁</span>
                  <span>{uploading ? '업로드 중...' : '파일 선택 (이미지, PDF 등)'}</span>
                  <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
                
                {formData.attachments && formData.attachments.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {formData.attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="shrink-0 text-slate-400">📄</span>
                          <span className="truncate text-slate-600" title={file.name}>{file.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={file.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">보기</a>
                          <button onClick={() => removeAttachment(idx)} className="text-red-400 hover:text-red-600">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 오른쪽 컬럼: 작업내용 (문서 작성용으로 크게) */}
          <div className="flex flex-col h-full">
            <label className="block text-xs font-bold text-slate-500 mb-1">작업내용 상세 기술</label>
            <textarea 
              className="w-full flex-grow rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[400px] lg:min-h-0" 
              value={formData.content}
              onChange={e => setFormData({...formData, content: e.target.value})}
              placeholder="문서 작성하듯 상세 내용을 입력하세요."
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3 border-t pt-4">
          <button 
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            취소
          </button>
          <button 
            onClick={handleSubmit}
            disabled={uploading}
            className={`rounded-lg px-8 py-2.5 text-sm font-bold text-white shadow-lg transition-all active:scale-95 ${uploading ? 'bg-slate-400' : 'bg-brand-600 hover:bg-brand-700'}`}
          >
            {uploading ? '파일 업로드 중...' : (item?.id ? '수정 완료' : '작업 등록')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ZoneViewModal({ zone, onClose, onEdit }: { zone: Zone, onClose: () => void, onEdit: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="mb-6 flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <span 
              className="h-4 w-4 rounded-full" 
              style={{ backgroundColor: zone.color || '#327fff' }} 
            />
            <h3 className="text-xl font-bold text-slate-900">{zone.project || zone.name || '작업 상세'}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onEdit}
              className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-bold text-brand-700 hover:bg-brand-100 transition-colors"
            >
              편집
            </button>
            <button onClick={onClose} className="ml-2 text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">브랜드</label>
                <p className="font-semibold text-slate-700">{BRAND_CONFIG[zone.brand || '']?.name || zone.brand || '-'}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">담당자</label>
                <p className="font-semibold text-slate-700">{zone.manager || '-'}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">파트/팀</label>
                <p className="font-semibold text-slate-700">{zone.team || zone.name || '-'}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">사용 기간</label>
                <p className="font-semibold text-slate-700">
                  {zone.startDate && zone.endDate ? `${zone.startDate} ~ ${zone.endDate}` : '미정'}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">사용 목적</label>
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
                {zone.purpose || '등록된 목적이 없습니다.'}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">비고 (참고 사항)</label>
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 min-h-[150px] whitespace-pre-wrap">
                {zone.note || '등록된 비고 사항이 없습니다.'}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t pt-4 flex justify-end">
          <button 
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-8 py-2.5 text-sm font-bold text-white hover:bg-slate-900 transition-colors shadow-md"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function WorkViewModal({ item, onClose, onEdit, onDelete }: { item: OverseasWork, onClose: () => void, onEdit: () => void, onDelete: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="mb-6 flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${item.workType === '해외' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
              {item.workType || '국내'}
            </span>
            <h3 className="text-xl font-bold text-slate-900">{item.projectName}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onEdit}
              className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-bold text-brand-700 hover:bg-brand-100 transition-colors"
            >
              수정
            </button>
            <button 
              onClick={onDelete}
              className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-100 transition-colors"
            >
              삭제
            </button>
            <button onClick={onClose} className="ml-2 text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1 space-y-6">
            <div className="space-y-4 rounded-lg bg-slate-50 p-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">브랜드</label>
                <div className="flex items-center gap-2">
                  <span 
                    className="h-3 w-3 rounded-full" 
                    style={{ backgroundColor: BRAND_CONFIG[item.brand]?.color || '#327fff' }} 
                  />
                  <span className="font-semibold text-slate-700">{BRAND_CONFIG[item.brand]?.name || item.brand}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">담당자</label>
                <p className="font-semibold text-slate-700">{item.manager}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">작업 장소</label>
                <p className="font-semibold text-slate-700">{item.location}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">출장 일정</label>
                <p className="font-semibold text-slate-700">
                  {item.startDate && item.endDate ? `${item.startDate} ~ ${item.endDate}` : '미정'}
                </p>
              </div>
            </div>

            {item.attachments && item.attachments.length > 0 && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <span>📎</span> 첨부 자료 ({item.attachments.length})
                </label>
                <div className="space-y-2">
                  {item.attachments.map((file, idx) => (
                    <a 
                      key={idx} 
                      href={file.url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50 hover:border-brand-300 transition-all group"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="shrink-0 text-slate-400 group-hover:text-brand-500">📄</span>
                        <span className="truncate text-slate-600 font-medium group-hover:text-brand-600">{file.name}</span>
                      </div>
                      <span className="text-[10px] font-bold text-brand-600 shrink-0">보기</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <span>📝</span> 작업 내용
            </label>
            <div className="rounded-xl border border-slate-200 bg-white p-6 min-h-[400px] whitespace-pre-wrap text-sm leading-relaxed text-slate-700 shadow-sm">
              {item.content || '등록된 내용이 없습니다.'}
            </div>
          </div>
        </div>

        <div className="mt-8 border-t pt-4 flex justify-end">
          <button 
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-8 py-2.5 text-sm font-bold text-white hover:bg-slate-900 transition-colors shadow-md"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function DirectWorkCalendarView({ items, currentDate, setCurrentDate, onView }: { 
  items: OverseasWork[], 
  currentDate: Date | null, 
  setCurrentDate: (d: Date) => void,
  onView: (item: OverseasWork) => void
}) {
  if (!currentDate) return <div className="p-8 text-center text-slate-500">달력을 불러오는 중...</div>
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(monthStart)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = endOfWeek(monthEnd)

  const allDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  })

  const weeks: Date[][] = []
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7))
  }

  const monthItems = items.filter(item => {
    if (!item.startDate || !item.endDate) return false
    const iStart = parseISO(item.startDate)
    const iEnd = parseISO(item.endDate)
    return (iStart <= calendarEnd) && (iEnd >= calendarStart)
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-700">
          {format(currentDate, 'yyyy년 MMMM', { locale: ko })}
        </h3>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="rounded border p-1 hover:bg-slate-50"
          >
            ◀
          </button>
          <button 
            onClick={() => setCurrentDate(new Date())}
            className="rounded border px-3 py-1 text-sm hover:bg-slate-50"
          >
            오늘
          </button>
          <button 
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="rounded border p-1 hover:bg-slate-50"
          >
            ▶
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b bg-slate-50 text-center text-xs font-semibold text-slate-500">
          {['일', '월', '화', '수', '목', '금', '토'].map(d => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="flex flex-col">
          {weeks.map((week, weekIdx) => {
            const weekStart = week[0]
            const weekEnd = week[6]

            const weekItems = monthItems.filter(item => {
              const start = parseISO(item.startDate)
              const end = parseISO(item.endDate)
              return start <= weekEnd && end >= weekStart
            })

            const rows: OverseasWork[][] = []
            const sortedItems = [...weekItems].sort((a, b) => a.startDate.localeCompare(b.startDate))

            sortedItems.forEach(item => {
              let assigned = false
              for (let i = 0; i < rows.length; i++) {
                const canPlace = rows[i].every(ri => {
                  const ris = parseISO(ri.startDate); const rie = parseISO(ri.endDate)
                  const s = parseISO(item.startDate); const e = parseISO(item.endDate)
                  return e < ris || s > rie
                })
                if (canPlace) {
                  rows[i].push(item)
                  assigned = true
                  break
                }
              }
              if (!assigned) rows.push([item])
            })

            return (
              <div key={weekIdx} className="relative border-b last:border-b-0 min-h-[120px]">
                <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                  {week.map((day, dayIdx) => {
                    const isCurrentMonth = isSameMonth(day, monthStart)
                    const isToday = isSameDay(day, new Date())
                    return (
                      <div key={dayIdx} className={`border-r p-1 ${!isCurrentMonth ? 'bg-slate-50/25' : 'bg-white'} ${dayIdx === 6 ? 'border-r-0' : ''}`}>
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                          isToday ? 'bg-brand-600 text-white' : isCurrentMonth ? 'text-slate-700' : 'text-slate-300'
                        }`}>
                          {format(day, 'd')}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="relative pt-8 pb-2 px-0.5 space-y-1">
                  {rows.slice(0, 6).map((row, rowIdx) => (
                    <div key={rowIdx} className="grid grid-cols-7 h-5 relative">
                      {row.map(item => {
                        const start_date = parseISO(item.startDate)
                        const end_date = parseISO(item.endDate)
                        const start = Math.max(0, differenceInCalendarDays(start_date, weekStart))
                        const end = Math.min(6, differenceInCalendarDays(end_date, weekStart))
                        const colStart = start + 1
                        const colSpan = end - start + 1
                        
                        const isAbsoluteStart = start_date >= weekStart && start_date <= weekEnd
                        const isAbsoluteEnd = end_date >= weekStart && end_date <= weekEnd

                        const color = BRAND_CONFIG[item.brand]?.color || '#327fff'

                        return (
                          <div 
                            key={item.id}
                            className="pointer-events-auto cursor-pointer text-[10px] flex items-center relative h-5 mx-0.5"
                            style={{ gridColumn: `${colStart} / span ${colSpan}` }}
                            title={`${item.projectName} | ${item.manager} (${item.startDate} ~ ${item.endDate})`}
                            onClick={() => onView(item)}
                          >
                            <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 opacity-60" style={{ backgroundColor: color }} />
                            
                            {isAbsoluteStart && (
                              <div className="absolute top-0 bottom-0 rounded shadow-sm flex items-center justify-center z-10"
                                style={{ left: '0', width: `${100 / colSpan}%`, backgroundColor: color }}
                              >
                                <span className="text-white font-bold truncate px-1 text-[9px]">{item.projectName}</span>
                              </div>
                            )}

                            {isAbsoluteEnd && (
                              <div className="absolute top-0 bottom-0 rounded shadow-sm flex items-center justify-center z-10"
                                style={{ right: '0', width: `${100 / colSpan}%`, backgroundColor: color }}
                              >
                                {(!isAbsoluteStart || colSpan > 1) && (
                                  <span className="text-white font-bold truncate px-1 text-[9px]">{isAbsoluteStart ? '종료' : item.projectName}</span>
                                )}
                              </div>
                            )}

                            {!isAbsoluteStart && !isAbsoluteEnd && (
                              <div className="w-full text-center relative z-0">
                                <span className="px-1 rounded-sm text-[9px] font-medium" style={{ color: color, backgroundColor: 'white', border: `1px solid ${color}20` }}>
                                  {item.projectName}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                  {rows.length > 6 && (
                    <div className="text-[10px] text-slate-400 pl-2 font-medium">+ {rows.length - 6}개 더보기</div>
                  )}
                  {rows.length === 0 && <div className="h-12" />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function EmailPasswordLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [message, setMessage] = useState<string | null>(null)

  const onSubmit = async () => {
    setMessage(null)
    setLoading(true)
    try {
      if (mode === 'signin') await emailSignIn(email, password)
      else await emailSignUp(email, password)
    } catch (e: any) {
      setMessage(e?.message || '요청 처리 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const onReset = async () => {
    setMessage(null)
    setLoading(true)
    try {
      await resetPassword(email)
      setMessage('비밀번호 재설정 메일을 보냈습니다.')
    } catch (e: any) {
      setMessage(e?.message || '재설정 메일 발송 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-lg border bg-white p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">관리자 로그인</h1>
        <Link href="/" className="text-sm text-brand-700 hover:underline">돌아가기</Link>
      </div>
      <p className="text-sm text-slate-600">이메일과 비밀번호로 로그인하세요.</p>

      <div className="space-y-2">
        <input
          type="email"
          placeholder="email@company.com"
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="비밀번호"
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {message && <div className="text-sm text-red-600">{message}</div>}

      <div className="flex items-center gap-2">
        <button
          className="rounded-md bg-brand-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={loading}
          onClick={onSubmit}
        >
          {mode === 'signin' ? '로그인' : '회원가입'}
        </button>
        <button
          className="rounded-md border px-3 py-2 text-sm"
          disabled={loading}
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin' ? '회원가입으로 전환' : '로그인으로 전환'}
        </button>
        <button className="ml-auto text-sm text-brand-700 hover:underline" disabled={loading} onClick={onReset}>
          비밀번호 재설정
        </button>
      </div>
    </div>
  )
}

function WorkspaceManager({
  selectedCategoryId,
  setSelectedCategoryId,
  selectedWorkspaceId,
  setSelectedWorkspaceId,
}: {
  selectedCategoryId: string
  setSelectedCategoryId: (v: string) => void
  selectedWorkspaceId: string
  setSelectedWorkspaceId: (v: string) => void
}) {
  const [categories, setCategories] = useState<Category[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'categories'), orderBy('name', 'asc')), (snap) => {
      const list: Category[] = []
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }))
      setCategories(list)
      if (list.length && !selectedCategoryId) setSelectedCategoryId(list[0].id)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!selectedCategoryId) return
    const q = query(collection(db, 'workspaces'), where('categoryId', '==', selectedCategoryId), orderBy('name', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      const list: Workspace[] = []
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }))
      setWorkspaces(list)
      if (list.length && !selectedWorkspaceId) setSelectedWorkspaceId(list[0].id)
    })
    return () => unsub()
  }, [selectedCategoryId])

  const createCategory = async () => {
    const name = prompt('카테고리 명칭을 입력하세요')?.trim()
    if (!name) return
    await addDoc(collection(db, 'categories'), { name, updatedAt: Date.now() })
  }

  const createWorkspace = async () => {
    if (!selectedCategoryId) return alert('카테고리를 먼저 선택하세요')
    const name = prompt('작업실 명칭을 입력하세요')?.trim()
    if (!name) return
    const docRef = await addDoc(collection(db, 'workspaces'), { name, categoryId: selectedCategoryId, updatedAt: Date.now() })
    setSelectedWorkspaceId(docRef.id)
  }

  const deleteWorkspace = async () => {
    if (!selectedWorkspaceId) return alert('삭제할 작업실을 선택하세요')
    const ws = workspaces.find(w => w.id === selectedWorkspaceId)
    if (!confirm(`작업실 "${ws?.name || selectedWorkspaceId}"을(를) 삭제하시겠습니까?\n해당 작업실의 모든 구역도 함께 삭제됩니다.`)) return
    // 1) zones 삭제
    const zq = query(collection(db, 'zones'), where('workspaceId', '==', selectedWorkspaceId))
    const zs = await getDocs(zq)
    await Promise.all(zs.docs.map(d => deleteDoc(doc(db, 'zones', d.id))))
    // 2) plan 삭제(있다면)
    const planUrl = ws?.planUrl
    if (planUrl) {
      try { await deleteObject(ref(storage, planUrl)) } catch (_) {}
    }
    // 3) workspace 문서 삭제
    await deleteDoc(doc(db, 'workspaces', selectedWorkspaceId))
    setSelectedWorkspaceId('')
  }

  const uploadPlan = async (file: File) => {
    const u = auth.currentUser
    if (!u) { alert('로그인이 필요합니다.'); return }
    await u.getIdToken(true)
    if (!selectedWorkspaceId) return alert('작업실을 선택하세요')
    const ext = file.name.split('.').pop() || 'png'
    const r = ref(storage, `plans/${selectedWorkspaceId}.${ext}`)
    const res = await uploadBytes(r, file)
    const url = await getDownloadURL(res.ref)
    await setDoc(doc(db, 'workspaces', selectedWorkspaceId), { planUrl: url, updatedAt: Date.now() }, { merge: true })
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">작업실/카테고리 관리</h2>
        <div className="flex items-center gap-2">
          <button className="rounded border px-3 py-1 text-sm" onClick={createCategory}>카테고리 추가</button>
          <button className="rounded border px-3 py-1 text-sm" onClick={createWorkspace}>작업실 추가</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-md border px-3 py-1 text-sm" value={selectedCategoryId} onChange={(e) => { setSelectedCategoryId(e.target.value); setSelectedWorkspaceId('') }}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="rounded-md border px-3 py-1 text-sm" value={selectedWorkspaceId} onChange={(e) => setSelectedWorkspaceId(e.target.value)}>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <div className="ml-auto text-sm text-slate-600">
          현재 도면: {workspaces.find(w => w.id === selectedWorkspaceId)?.planUrl ? <a className="text-brand-700 underline" href={workspaces.find(w => w.id === selectedWorkspaceId)?.planUrl} target="_blank">열기</a> : '없음'}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPlan(f) }} />
          <button className="rounded-md bg-slate-800 px-3 py-1 text-sm text-white" onClick={() => fileRef.current?.click()}>
            도면 업로드
          </button>
        </div>
      </div>
    </div>
  )
}

function WorkspacesOverview({
  selectedCategoryId,
  setSelectedCategoryId,
  setSelectedWorkspaceId,
  openZoneEditor,
  filterStart,
  setFilterStart,
  filterEnd,
  setFilterEnd,
}: {
  selectedCategoryId: string
  setSelectedCategoryId: (v: string) => void
  setSelectedWorkspaceId: (v: string) => void
  openZoneEditor: (categoryId: string, workspaceId: string) => void
  filterStart: string
  setFilterStart: (v: string) => void
  filterEnd: string
  setFilterEnd: (v: string) => void
}) {
  const [categories, setCategories] = useState<Category[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [zonesByWs, setZonesByWs] = useState<Record<string, Zone[]>>({})
  const [showModal, setShowModal] = useState(false)
  const [modalSelectedCategoryId, setModalSelectedCategoryId] = useState('')
  const [modalNewCategory, setModalNewCategory] = useState('')
  const [modalWorkspaceName, setModalWorkspaceName] = useState('')
  const [modalPlanFile, setModalPlanFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  
  // 수정용 상태
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [tempCatName, setTempCatName] = useState('')
  const [editingWsId, setEditingWsId] = useState<string | null>(null)
  const [tempWsName, setTempWsName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [changingPlanWsId, setChangingPlanWsId] = useState<string | null>(null)

  // 각 도면의 실제 해상도를 저장하여 왜곡 방지
  const [imgDimensions, setImgDimensions] = useState<Record<string, { w: number; h: number }>>({})

  useEffect(() => {
    const unsubCats = onSnapshot(query(collection(db, 'categories'), orderBy('name', 'asc')), (snap) => {
      const list: Category[] = []
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }))
      setCategories(list)
    })
    const unsubWs = onSnapshot(query(collection(db, 'workspaces'), orderBy('name', 'asc')), (snap) => {
      const list: Workspace[] = []
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }))
      setWorkspaces(list)
    })
    return () => { unsubCats(); unsubWs() }
  }, [])

  useEffect(() => {
    // 실시간으로 모든 구역을 구독하여 작업실별로 분류 (미니 프리뷰용)
    const q = query(collection(db, 'zones'), orderBy('updatedAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      const results: Record<string, Zone[]> = {}
      snap.forEach((d) => {
        const z = { id: d.id, ...(d.data() as any) } as Zone
        if (z.workspaceId) {
          if (!results[z.workspaceId]) results[z.workspaceId] = []
          results[z.workspaceId].push(z)
        }
      })
      setZonesByWs(results)
    })
    return () => unsub()
  }, [])

  const updateCategoryName = async (id: string) => {
    if (!tempCatName.trim()) return
    try {
      await updateDoc(doc(db, 'categories', id), { name: tempCatName.trim(), updatedAt: Date.now() })
      setEditingCatId(null)
    } catch (e) {
      alert('카테고리명 수정에 실패했습니다.')
    }
  }

  const updateWorkspaceName = async (id: string) => {
    if (!tempWsName.trim()) return
    try {
      await updateDoc(doc(db, 'workspaces', id), { name: tempWsName.trim(), updatedAt: Date.now() })
      setEditingWsId(null)
    } catch (e) {
      alert('작업실명 수정에 실패했습니다.')
    }
  }

  const handlePlanChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !changingPlanWsId) return
    
    setSaving(true)
    try {
      // 기존 도면 삭제 시도 (필요한 경우)
      const ws = workspaces.find(w => w.id === changingPlanWsId)
      
      const ext = (file.name.split('.').pop() || 'png')
      const r = ref(storage, `plans/${changingPlanWsId}.${ext}`)
      const res = await uploadBytes(r, file)
      const url = await getDownloadURL(res.ref)
      await updateDoc(doc(db, 'workspaces', changingPlanWsId), { planUrl: url, updatedAt: Date.now() })
      alert('도면이 변경되었습니다.')
    } catch (e: any) {
      console.error(e)
      alert('도면 변경에 실패했습니다.')
    } finally {
      setSaving(false)
      setChangingPlanWsId(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const byCategory: Record<string, Workspace[]> = {}
  for (const w of workspaces) {
    if (!byCategory[w.categoryId]) byCategory[w.categoryId] = []
    byCategory[w.categoryId].push(w)
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 font-medium">기간 필터:</span>
            <div className="relative">
              <DatePicker
                selectsRange={true}
                startDate={filterStart ? parseISO(filterStart) : null}
                endDate={filterEnd ? parseISO(filterEnd) : null}
                onChange={(update) => {
                  const [start, end] = update;
                  setFilterStart(start ? format(start, 'yyyy-MM-dd') : '');
                  setFilterEnd(end ? format(end, 'yyyy-MM-dd') : '');
                }}
                isClearable={true}
                placeholderText="기간 선택"
                className="w-48 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                locale={ko}
                dateFormat="yyyy-MM-dd"
              />
            </div>
          </div>
          <button className="rounded-md bg-brand-600 px-3 py-1 text-sm text-white" onClick={() => { 
            const defaultCat = selectedCategoryId || (categories[0]?.id || '');
            setModalSelectedCategoryId(defaultCat); 
            setModalNewCategory(''); 
            setShowModal(true); 
          }}>새 작업실 추가</button>
        </div>
      </div>

      <div className="space-y-4">
        {categories.map((c) => (
          <div key={c.id}>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {editingCatId === c.id ? (
                  <div className="flex items-center gap-1">
                    <input 
                      className="rounded border px-2 py-0.5 text-sm" 
                      value={tempCatName} 
                      onChange={(e) => setTempCatName(e.target.value)} 
                      autoFocus
                    />
                    <button className="text-xs text-brand-600 font-bold" onClick={() => updateCategoryName(c.id)}>저장</button>
                    <button className="text-xs text-slate-400" onClick={() => setEditingCatId(null)}>취소</button>
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-semibold text-slate-700">{c.name}</div>
                    <button 
                      className="text-[10px] text-slate-400 hover:text-brand-600" 
                      onClick={() => { setEditingCatId(c.id); setTempCatName(c.name); }}
                      title="카테고리명 수정"
                    >
                      📝
                    </button>
                  </>
                )}
              </div>
              <button
                className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                onClick={async () => {
                  if (!confirm(`카테고리 "${c.name}" 및 하위 모든 작업실을 삭제하시겠습니까?`)) return
                  // 하위 작업실 조회
                  const wsSnap = await getDocs(query(collection(db, 'workspaces'), where('categoryId', '==', c.id)))
                  for (const wd of wsSnap.docs) {
                    const w = { id: wd.id, ...(wd.data() as any) } as Workspace
                    // zones 삭제
                    const zSnap = await getDocs(query(collection(db, 'zones'), where('workspaceId', '==', w.id)))
                    await Promise.all(zSnap.docs.map(d => deleteDoc(doc(db, 'zones', d.id))))
                    // plan 삭제
                    if (w.planUrl) { try { await deleteObject(ref(storage, w.planUrl)) } catch (_) {} }
                    // workspace 문서 삭제
                    await deleteDoc(doc(db, 'workspaces', w.id))
                  }
                  // 카테고리 문서 삭제
                  await deleteDoc(doc(db, 'categories', c.id))
                }}
              >
                카테고리 삭제
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {(byCategory[c.id] || []).map((w) => (
                <div key={w.id} className="rounded border p-2">
                  <div className="mb-2 flex items-center justify-between">
                    {editingWsId === w.id ? (
                      <div className="flex items-center gap-1 flex-1 mr-2">
                        <input 
                          className="w-full rounded border px-2 py-0.5 text-sm" 
                          value={tempWsName} 
                          onChange={(e) => setTempWsName(e.target.value)} 
                          autoFocus
                        />
                        <button className="text-xs text-brand-600 font-bold whitespace-nowrap" onClick={() => updateWorkspaceName(w.id)}>저장</button>
                        <button className="text-xs text-slate-400 whitespace-nowrap" onClick={() => setEditingWsId(null)}>취소</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 truncate mr-2">
                        <div className="truncate text-sm font-medium">{w.name}</div>
                        <button 
                          className="text-[10px] text-slate-400 hover:text-brand-600 shrink-0" 
                          onClick={() => { setEditingWsId(w.id); setTempWsName(w.name); }}
                          title="작업실명 수정"
                        >
                          📝
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        title="작업실 삭제"
                        aria-label="작업실 삭제"
                        className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                        onClick={async () => {
                          if (!confirm(`작업실 "${w.name}" 을(를) 삭제하시겠습니까?\n해당 작업실의 모든 구역도 함께 삭제됩니다.`)) return
                          const zSnap = await getDocs(query(collection(db, 'zones'), where('workspaceId', '==', w.id)))
                          await Promise.all(zSnap.docs.map(d => deleteDoc(doc(db, 'zones', d.id))))
                          if (w.planUrl) { try { await deleteObject(ref(storage, w.planUrl)) } catch (_) {} }
                          await deleteDoc(doc(db, 'workspaces', w.id))
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="relative mb-2 aspect-[4/3] w-full overflow-hidden rounded border bg-white cursor-pointer" onClick={() => openZoneEditor(c.id, w.id)} title="클릭하여 편집">
                    {w.planUrl ? (
                      <img 
                        src={w.planUrl} 
                        alt="plan" 
                        className="h-full w-full object-contain"
                        onLoad={(e) => {
                          const img = e.currentTarget as HTMLImageElement
                          setImgDimensions(prev => ({
                            ...prev,
                            [w.id]: { w: img.naturalWidth, h: img.naturalHeight }
                          }))
                        }}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-500">도면 없음</div>
                    )}
                    {/* 미니 오버레이 */}
                    {w.planUrl && imgDimensions[w.id] && (
                      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${imgDimensions[w.id].w} ${imgDimensions[w.id].h}`} preserveAspectRatio="xMidYMid meet">
                        {(zonesByWs[w.id] || [])
                          .filter(z => {
                            if (!filterStart && !filterEnd) return true
                            const zs = z.startDate || ''
                            const ze = z.endDate || ''
                            if (!zs && !ze) return false
                            if (filterStart && ze && ze < filterStart) return false
                            if (filterEnd && zs && zs > filterEnd) return false
                            return true
                          })
                          .map((z) => {
                            const { w: imgW, h: imgH } = imgDimensions[w.id]
                            return z.rect ? (
                              <g key={z.id}>
                                <rect x={z.rect.x * imgW} y={z.rect.y * imgH} width={z.rect.width * imgW} height={z.rect.height * imgH} fill={z.color || '#327fff'} fillOpacity={0.2} stroke={z.color || '#327fff'} strokeWidth={2} rx={6} ry={6} />
                                <text x={(z.rect.x + z.rect.width / 2) * imgW} y={(z.rect.y + z.rect.height / 2) * imgH} textAnchor="middle" dominantBaseline="middle" fontSize={12} fill="#0f172a" className="pointer-events-none select-none">
                                  <tspan x={(z.rect.x + z.rect.width / 2) * imgW} dy="-1.2em" fontWeight="bold">{z.project || '-'}</tspan>
                                  <tspan x={(z.rect.x + z.rect.width / 2) * imgW} dy="1.2em">{z.team || z.name}</tspan>
                                  <tspan x={(z.rect.x + z.rect.width / 2) * imgW} dy="1.2em" fontSize={10} fill="#475569">{z.startDate || '미정'} ~ {z.endDate || '미정'}</tspan>
                                </text>
                              </g>
                            ) : (
                              <polygon
                                key={z.id}
                                points={z.points.map((p) => `${p.x * imgW},${p.y * imgH}`).join(' ')}
                                fill={z.color || '#327fff'}
                                fillOpacity={0.2}
                                stroke={z.color || '#327fff'}
                                strokeWidth={2}
                              />
                            )
                          }
                        )}
                      </svg>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    {w.planUrl ? (
                      <button 
                        className="text-xs text-brand-700 underline" 
                        onClick={() => { setChangingPlanWsId(w.id); fileInputRef.current?.click(); }}
                      >
                        도면 변경
                      </button>
                    ) : (
                      <button 
                        className="text-xs text-brand-700 underline"
                        onClick={() => { setChangingPlanWsId(w.id); fileInputRef.current?.click(); }}
                      >
                        도면 등록
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {(byCategory[c.id] || []).length === 0 && (
                <div className="rounded border p-2 text-xs text-slate-500">작업실 없음</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">새 작업실 추가</h3>
              <button className="rounded border px-2 py-1 text-xs" onClick={() => setShowModal(false)}>닫기</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 items-center gap-2">
                <label className="col-span-1">카테고리</label>
                <select 
                  className="col-span-2 rounded border px-2 py-1" 
                  value={modalSelectedCategoryId || ''} 
                  onChange={(e) => {
                    setModalSelectedCategoryId(e.target.value);
                    if (e.target.value !== '__NEW__') setModalNewCategory('');
                  }}
                >
                  <option value="">-- 카테고리 선택 --</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="__NEW__">+ 새 카테고리 추가</option>
                </select>

                {(modalSelectedCategoryId === '__NEW__' || categories.length === 0) && (
                  <>
                    <label className="col-span-1">새 카테고리명</label>
                    <input 
                      className="col-span-2 rounded border px-2 py-1" 
                      placeholder="예: 5F 협업존" 
                      value={modalNewCategory} 
                      onChange={(e) => setModalNewCategory(e.target.value)} 
                    />
                  </>
                )}

                <label className="col-span-1">작업실 명칭</label>
                <input className="col-span-2 rounded border px-2 py-1" value={modalWorkspaceName} onChange={(e) => setModalWorkspaceName(e.target.value)} />

                <label className="col-span-1">도면 업로드</label>
                <input className="col-span-2" type="file" accept="image/*" onChange={(e) => setModalPlanFile(e.target.files?.[0] || null)} />
              </div>
              <div className="text-xs text-slate-500">도면 업로드는 필수입니다.</div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="rounded border px-3 py-1 text-sm" onClick={() => setShowModal(false)}>취소</button>
              <button
                className="rounded bg-brand-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                disabled={saving}
                onClick={async () => {
                  if (!modalWorkspaceName.trim()) { alert('작업실 명칭을 입력하세요'); return }
                  if (!modalPlanFile) { alert('도면 파일을 업로드하세요'); return }
                  
                  setSaving(true)
                  try {
                    let categoryId = modalSelectedCategoryId
                    
                    // 카테고리가 아예 없거나 새 카테고리 추가 모드인 경우
                    if (categoryId === '__NEW__' || categories.length === 0) {
                      const newName = modalNewCategory.trim()
                      if (!newName) { 
                        alert('새 카테고리명을 입력하세요'); 
                        setSaving(false); 
                        return 
                      }
                      const catRef = await addDoc(collection(db, 'categories'), { name: newName, updatedAt: Date.now() })
                      categoryId = catRef.id
                    }

                    if (!categoryId) { 
                      alert('카테고리를 선택하거나 입력하세요'); 
                      setSaving(false); 
                      return 
                    }
                    const wsRef = await addDoc(collection(db, 'workspaces'), { name: modalWorkspaceName.trim(), categoryId, updatedAt: Date.now() })
                    const ext = (modalPlanFile.name.split('.').pop() || 'png')
                    const r = ref(storage, `plans/${wsRef.id}.${ext}`)
                    const res = await uploadBytes(r, modalPlanFile)
                    const url = await getDownloadURL(res.ref)
                    await setDoc(doc(db, 'workspaces', wsRef.id), { planUrl: url, updatedAt: Date.now() }, { merge: true })
                    setSelectedCategoryId(categoryId)
                    setSelectedWorkspaceId(wsRef.id)
                    setShowModal(false)
                    setModalSelectedCategoryId(''); setModalNewCategory(''); setModalWorkspaceName(''); setModalPlanFile(null)
                  } catch (e: any) {
                    alert(e?.message || '작업실 생성에 실패했습니다.')
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                생성하기
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 도면 변경용 숨겨진 입력창 */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handlePlanChange} 
      />
    </div>
  )
}

function ZoneEditor({ 
  activeWorkspaceId,
  filterStart,
  setFilterStart,
  filterEnd,
  setFilterEnd 
}: { 
  activeWorkspaceId: string;
  filterStart: string;
  setFilterStart: (v: string) => void;
  filterEnd: string;
  setFilterEnd: (v: string) => void;
}) {
  const [planUrl, setPlanUrl] = useState<string | undefined>('')
  const [zones, setZones] = useState<Zone[]>([])
  const [editing, setEditing] = useState<Zone | null>(null)
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number }>({ w: 1000, h: 750 })
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [checkedZoneIds, setCheckedZoneIds] = useState<Set<string>>(new Set())

  const filteredZones = useMemo(() => {
    return zones.filter(z => {
      if (!filterStart && !filterEnd) return true
      const zs = z.startDate || ''
      const ze = z.endDate || ''
      if (!zs && !ze) return false
      if (filterStart && ze && ze < filterStart) return false
      if (filterEnd && zs && zs > filterEnd) return false
      return true
    })
  }, [zones, filterStart, filterEnd])

  // 필터링된 구역이 변경될 때(날짜 변경 등) 모든 구역을 체크된 상태로 초기화
  useEffect(() => {
    setCheckedZoneIds(new Set(filteredZones.map(z => z.id)))
  }, [filteredZones])

  const handleToggleZone = (id: string) => {
    const next = new Set(checkedZoneIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setCheckedZoneIds(next)
  }

  useEffect(() => {
    if (!activeWorkspaceId) return
    const q = query(collection(db, 'zones'), where('workspaceId', '==', activeWorkspaceId), orderBy('updatedAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      const list: Zone[] = []
      snap.forEach((d) => list.push({ ...(d.data() as any), id: d.id }))
      setZones(list)
    })
    return () => unsub()
  }, [activeWorkspaceId])

  useEffect(() => {
    if (!activeWorkspaceId) { setPlanUrl(''); return }
    const unsub = onSnapshot(doc(db, 'workspaces', activeWorkspaceId), (d) => {
      setPlanUrl((d.data() as any)?.planUrl)
    })
    return () => unsub()
  }, [activeWorkspaceId])

  const startNewZone = () => {
    if (!activeWorkspaceId) return alert('상단에서 작업실을 선택하세요')
    setEditing({
      id: 'new',
      name: '',
      team: '',
      purpose: '',
      note: '',
      brand: 'GM',
      color: BRAND_CONFIG.GM.color,
      workspaceId: activeWorkspaceId,
      points: [],
      rect: undefined,
      startDate: filterStart,
      endDate: filterEnd,
      updatedAt: Date.now(),
      active: true,
    })
  }

  const saveZone = async (z: Zone) => {
    if (!z.name && !z.team) return alert('파트/팀을 입력하세요')
    const { id, ...rest } = z
    const payload = { ...rest, updatedAt: Date.now() }
    if (z.id === 'new') {
      const { id } = await addDoc(collection(db, 'zones'), payload)
      // 생성된 문서에 id 필드를 동기화해 일관성 유지
      await setDoc(doc(db, 'zones', id), { id }, { merge: true })
      setEditing(null)
    } else {
      await updateDoc(doc(db, 'zones', z.id), payload as any)
      setEditing(null)
    }
  }

  const removeZone = async (id: string) => {
    if (!confirm('구역을 삭제하시겠습니까?')) return
    try {
      await deleteDoc(doc(db, 'zones', id))
      // 삭제 후 편집 모드라면 편집 모드 해제
      if (editing && editing.id === id) {
        setEditing(null)
      }
    } catch (e: any) {
      console.error('구역 삭제 실패:', e)
      alert(e?.message || '구역 삭제에 실패했습니다.')
    }
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">구역 편집</h2>
        <div className="text-sm text-slate-600">상단에서 작업실을 선택하세요.</div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div ref={containerRef} className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-slate-50">
            {planUrl ? (
              <img
                src={planUrl}
                alt="floor plan"
                className="h-full w-full object-contain"
                onLoad={(e) => {
                  const img = e.currentTarget as HTMLImageElement
                  setImgNatural({ w: img.naturalWidth, h: img.naturalHeight })
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500">도면이 없습니다.</div>
            )}

            {/* 오버레이 */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${imgNatural.w} ${imgNatural.h}`} preserveAspectRatio="xMidYMid meet">
              {filteredZones
                .filter(z => checkedZoneIds.has(z.id))
                .map((z) => (
                z.rect ? (
                  <g key={z.id}>
                    <rect x={z.rect.x * imgNatural.w} y={z.rect.y * imgNatural.h} width={z.rect.width * imgNatural.w} height={z.rect.height * imgNatural.h} fill={z.color || '#327fff'} fillOpacity={0.2} stroke={z.color || '#327fff'} strokeWidth={2} rx={6} ry={6} />
                    <text x={(z.rect.x + z.rect.width / 2) * imgNatural.w} y={(z.rect.y + z.rect.height / 2) * imgNatural.h} textAnchor="middle" dominantBaseline="middle" fontSize={12} fill="#0f172a" className="pointer-events-none select-none">
                      <tspan x={(z.rect.x + z.rect.width / 2) * imgNatural.w} dy="-1.2em" fontWeight="bold">{z.project || '-'}</tspan>
                      <tspan x={(z.rect.x + z.rect.width / 2) * imgNatural.w} dy="1.2em">{z.team || z.name}</tspan>
                      <tspan x={(z.rect.x + z.rect.width / 2) * imgNatural.w} dy="1.2em" fontSize={10} fill="#475569">{z.startDate || '미정'} ~ {z.endDate || '미정'}</tspan>
                    </text>
                  </g>
                ) : (
                  <polygon
                    key={z.id}
                    points={z.points.map((p) => `${p.x * imgNatural.w},${p.y * imgNatural.h}`).join(' ')}
                    fill={z.color || '#327fff'}
                    fillOpacity={0.2}
                    stroke={z.color || '#327fff'}
                    strokeWidth={2}
                  />
                )
              ))}

              {editing && editing.rect && (
                <rect x={editing.rect.x * imgNatural.w} y={editing.rect.y * imgNatural.h} width={editing.rect.width * imgNatural.w} height={editing.rect.height * imgNatural.h} fill="none" stroke={editing.color || '#327fff'} strokeDasharray="4 4" strokeWidth={2} rx={6} ry={6} />
              )}
            </svg>

            {/* 드래그 캡쳐 레이어 */}
            {editing && planUrl && (
              <div
                className="absolute inset-0"
                onMouseDown={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                  const x = e.clientX - rect.left
                  const y = e.clientY - rect.top
                  const vw = imgNatural.w
                  const vh = imgNatural.h
                  const rw = rect.width
                  const rh = rect.height
                  const scale = Math.min(rw / vw, rh / vh)
                  const offX = (rw - vw * scale) / 2
                  const offY = (rh - vh * scale) / 2
                  const nx = (x - offX) / scale / vw
                  const ny = (y - offY) / scale / vh
                  setDragStart({ x: nx, y: ny })
                  setEditing((prev) => prev ? { ...prev, rect: { x: nx, y: ny, width: 0, height: 0 } } : prev)
                }}
                onMouseMove={(e) => {
                  if (!dragStart) return
                  const rectEl = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                  const x = e.clientX - rectEl.left
                  const y = e.clientY - rectEl.top
                  const vw = imgNatural.w
                  const vh = imgNatural.h
                  const rw = rectEl.width
                  const rh = rectEl.height
                  const scale = Math.min(rw / vw, rh / vh)
                  const offX = (rw - vw * scale) / 2
                  const offY = (rh - vh * scale) / 2
                  let nx = (x - offX) / scale / vw
                  let ny = (y - offY) / scale / vh
                  nx = Math.max(0, Math.min(1, nx))
                  ny = Math.max(0, Math.min(1, ny))
                  const x0 = Math.min(dragStart.x, nx)
                  const y0 = Math.min(dragStart.y, ny)
                  const w = Math.abs(nx - dragStart.x)
                  const h = Math.abs(ny - dragStart.y)
                  setEditing((prev) => prev ? { ...prev, rect: { x: x0, y: y0, width: w, height: h } } : prev)
                }}
                onMouseUp={() => setDragStart(null)}
                onMouseLeave={() => setDragStart(null)}
                title="드래그하여 사각형을 그립니다."
              />
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <span>드래그: 사각형 생성</span>
          </div>
        </div>

        <div className="relative min-h-[500px]">
          {!editing ? (
            <div className="flex flex-col h-full">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-base font-semibold">구역 목록</h3>
                <button className="rounded-md bg-brand-600 px-3 py-1 text-sm text-white" onClick={startNewZone}>새 구역</button>
              </div>
              
              {/* 기간 필터 및 전체 선택/해제 */}
              <div className="mb-2 space-y-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 font-medium ml-1">기간 필터:</span>
                  <div className="relative">
                    <DatePicker
                      selectsRange={true}
                      startDate={filterStart ? parseISO(filterStart) : null}
                      endDate={filterEnd ? parseISO(filterEnd) : null}
                      onChange={(update) => {
                        const [start, end] = update;
                        setFilterStart(start ? format(start, 'yyyy-MM-dd') : '');
                        setFilterEnd(end ? format(end, 'yyyy-MM-dd') : '');
                      }}
                      isClearable={true}
                      placeholderText="기간 선택"
                      className="w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                      locale={ko}
                      dateFormat="yyyy-MM-dd"
                    />
                  </div>
                </div>
                <div className="flex gap-2 text-xs">
                  {(filterStart !== format(new Date(), 'yyyy-MM-dd') || filterEnd !== format(new Date(), 'yyyy-MM-dd')) && (
                    <button 
                      className="rounded border bg-white px-2 py-1 text-slate-500 hover:bg-slate-50 transition-colors"
                      onClick={() => { 
                        const today = format(new Date(), 'yyyy-MM-dd');
                        setFilterStart(today); 
                        setFilterEnd(today); 
                      }}
                    >필터 초기화 (오늘)</button>
                  )}
                </div>
              </div>

              <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
                {filteredZones.map((z) => (
                  <div key={z.id} className="rounded border p-2 bg-white transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          checked={checkedZoneIds.has(z.id)}
                          onChange={() => handleToggleZone(z.id)}
                        />
                        <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: z.color || '#327fff' }} />
                        <div className="text-sm font-medium">{z.team || z.name}</div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <button className="rounded border bg-white px-2 py-0.5 hover:bg-slate-50" onClick={() => setEditing({ ...z })}>편집</button>
                        <button className="rounded border bg-white px-2 py-0.5 text-red-600 hover:bg-red-50" onClick={() => removeZone(z.id)}>삭제</button>
                      </div>
                    </div>
                    <div className="mt-1 flex flex-col gap-0.5 ml-12">
                      {z.project && <div className="text-xs font-semibold text-slate-700">[{z.project}]</div>}
                      {z.purpose && <div className="text-xs text-slate-600 truncate">{z.purpose}</div>}
                      <div className="text-[11px] font-medium text-slate-500">
                        기간: {z.startDate || '미정'} ~ {z.endDate || '미정'}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredZones.length === 0 && <div className="text-sm text-slate-500">등록된 구역이 없습니다.</div>}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 z-10 flex flex-col rounded-lg border bg-white p-3 shadow-sm overflow-auto max-h-[600px]">
              <div className="mb-4 flex items-center justify-between border-b pb-2">
                <h4 className="font-semibold">구역 속성 {editing.id === 'new' ? '추가' : '편집'}</h4>
                <button className="text-slate-400 hover:text-slate-600" onClick={() => setEditing(null)}>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <label className="col-span-1 self-center">프로젝트명</label>
                <input className="col-span-2 rounded border px-2 py-1" value={editing.project || ''}
                  onChange={(e) => setEditing({ ...editing, project: e.target.value })} />

                <label className="col-span-1 self-center">파트/팀</label>
                <input className="col-span-2 rounded border px-2 py-1" value={editing.team || editing.name}
                  onChange={(e) => setEditing({ ...editing, team: e.target.value, name: e.target.value })} />

                <label className="col-span-1 self-center">브랜드</label>
                <div className="col-span-2 flex flex-wrap gap-2">
                  {Object.entries(BRAND_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setEditing({ ...editing, brand: key, color: cfg.color })}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border-2 ${
                        editing.brand === key 
                          ? 'border-slate-900 ring-2 ring-slate-200 shadow-sm' 
                          : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      style={editing.brand === key ? { backgroundColor: cfg.color, color: 'white' } : {}}
                    >
                      {cfg.name}
                    </button>
                  ))}
                </div>

                <label className="col-span-1 self-center">담당자</label>
                <input className="col-span-2 rounded border px-2 py-1" value={editing.manager || ''}
                  onChange={(e) => setEditing({ ...editing, manager: e.target.value })} />

                <label className="col-span-1 self-start">사용 목적</label>
                <textarea className="col-span-2 min-h-24 rounded border px-2 py-1" value={editing.purpose || ''}
                  onChange={(e) => setEditing({ ...editing, purpose: e.target.value })} />

                <label className="col-span-1 self-center">비고</label>
                <input className="col-span-2 rounded border px-2 py-1" value={editing.note || ''}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })} />

                <label className="col-span-1 self-center">기간 설정</label>
                <div className="col-span-2 relative">
                  <DatePicker
                    selectsRange={true}
                    startDate={editing.startDate ? (isValid(parseISO(editing.startDate)) ? parseISO(editing.startDate) : null) : null}
                    endDate={editing.endDate ? (isValid(parseISO(editing.endDate)) ? parseISO(editing.endDate) : null) : null}
                    onChange={(update) => {
                      const [start, end] = update;
                      setEditing({
                        ...editing,
                        startDate: start ? format(start, 'yyyy-MM-dd') : '',
                        endDate: end ? format(end, 'yyyy-MM-dd') : ''
                      });
                    }}
                    isClearable={true}
                    placeholderText="시작일 - 종료일 선택"
                    className="w-full rounded border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    locale={ko}
                    dateFormat="yyyy-MM-dd"
                  />
                </div>
              </div>

              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>사각형: {editing.rect ? `${Math.round(editing.rect.width * 100)}% × ${Math.round(editing.rect.height * 100)}%` : '미지정'}</span>
                  <button className="ml-auto rounded border px-2 py-1 transition-colors hover:bg-slate-50" onClick={() => setEditing({ ...editing, rect: undefined, points: [] })}>사각형 초기화</button>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button className="rounded border px-3 py-1 text-sm" onClick={() => setEditing(null)}>취소</button>
                  <button className="rounded bg-brand-600 px-3 py-1 text-sm text-white" onClick={() => saveZone(editing)}>저장</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ZoneEditorModal({ 
  activeWorkspaceId, 
  onClose,
  filterStart,
  setFilterStart,
  filterEnd,
  setFilterEnd
}: { 
  activeWorkspaceId: string; 
  onClose: () => void;
  filterStart: string;
  setFilterStart: (v: string) => void;
  filterEnd: string;
  setFilterEnd: (v: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[95vh] w-full max-w-6xl overflow-auto rounded-lg border bg-white p-4 relative">
        <button className="absolute right-3 top-3 rounded border px-2 py-1 text-sm" onClick={onClose}>닫기</button>
        <ZoneEditor 
          activeWorkspaceId={activeWorkspaceId} 
          filterStart={filterStart}
          setFilterStart={setFilterStart}
          filterEnd={filterEnd}
          setFilterEnd={setFilterEnd}
        />
      </div>
    </div>
  )
}

function SidebarSettings() {
  const [categories, setCategories] = useState<Category[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [order, setOrder] = useState<string[]>([])

  useEffect(() => {
    const unsubCats = onSnapshot(query(collection(db, 'categories'), orderBy('name', 'asc')), (snap) => {
      const list: Category[] = []
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }))
      setCategories(list)
      setOrder((prev) => {
        // 유지 가능한 기존 순서 반영 후, 누락된 항목은 뒤에 추가
        const existing = prev.filter((id) => list.some((c) => c.id === id))
        const missing = list.map((c) => c.id).filter((id) => !existing.includes(id))
        return existing.concat(missing)
      })
    })
    const unsubSetting = onSnapshot(doc(db, 'settings', 'sidebar'), (d) => {
      const data = d.exists() ? (d.data() as any) : null
      const ids = (data?.categoryIds as string[]) || []
      const ord = (data?.order as string[]) || []
      const map: Record<string, boolean> = {}
      ids.forEach((id) => (map[id] = true))
      setSelected(map)
      if (ord.length) setOrder(ord)
    })
    return () => { unsubCats(); unsubSetting() }
  }, [])

  const toggle = (id: string) => setSelected((m) => ({ ...m, [id]: !m[id] }))

  const save = async () => {
    setSaving(true)
    try {
      const categoryIds = categories.filter((c) => selected[c.id]).map((c) => c.id)
      await setDoc(doc(db, 'settings', 'sidebar'), { categoryIds, order, updatedAt: Date.now() }, { merge: true })
      alert('사이드바 설정이 저장되었습니다.')
    } catch (e: any) {
      alert(e?.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex-1" />
        <button className="rounded bg-brand-600 px-3 py-1 text-sm text-white disabled:opacity-50" disabled={saving} onClick={save}>설정 저장</button>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
        {Array.from(new Set([...(order || []), ...categories.map((c) => c.id)])).map((id) => {
          const c = categories.find((x) => x.id === id)
          if (!c) return null
          return (
            <div key={c.id}
              className="flex cursor-move items-center gap-2 rounded border p-2 text-sm"
              draggable
              onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id) }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const fromId = e.dataTransfer.getData('text/plain')
                if (!fromId || fromId === c.id) return
                setOrder((prev) => {
                  const arr = (prev || []).slice()
                  if (!arr.includes(fromId)) arr.push(fromId)
                  if (!arr.includes(c.id)) arr.push(c.id)
                  const fromIdx = arr.indexOf(fromId)
                  const toIdx = arr.indexOf(c.id)
                  arr.splice(toIdx, 0, arr.splice(fromIdx, 1)[0])
                  return arr
                })
              }}
              title="드래그하여 순서를 변경"
            >
              <span className="select-none text-slate-500">↕</span>
              <input type="checkbox" checked={!!selected[c.id]} onChange={() => toggle(c.id)} />
              <span className="truncate">{c.name}</span>
            </div>
          )
        })}
        {categories.length === 0 && <div className="text-sm text-slate-500">카테고리가 없습니다.</div>}
      </div>
      <div className="mt-2 text-xs text-slate-500">체크된 카테고리만 현황보기 사이드바에 노출됩니다. 비워두면 전체가 표시됩니다.</div>
    </div>
  )
}


