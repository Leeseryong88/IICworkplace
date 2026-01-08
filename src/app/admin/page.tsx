"use client";
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth, emailSignIn, emailSignUp, resetPassword, signOut } from '@/lib/useAuth'
import { auth, db, storage } from '@/lib/firebase'
import type { Floor, FloorId, Zone, Category, Workspace } from '@/lib/types'
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
  
  // 공용 기간 필터 상태 (작업장 관리와 구역 편집에서 공유)
  const [filterStart, setFilterStart] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [filterEnd, setFilterEnd] = useState(format(new Date(), 'yyyy-MM-dd'))

  // 섹션 접힘 상태 관리
  const [showWorkspaces, setShowWorkspaces] = useState(true)
  const [showZoneList, setShowZoneList] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-brand-700 hover:underline">← 현황 보기</Link>
          <h1 className="text-2xl font-bold">관리자 편집</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">{user?.email}</span>
          <button onClick={() => signOut()} className="rounded-md border px-3 py-1">로그아웃</button>
        </div>
      </div>

      <CollapsibleSection title="작업장 관리" isOpen={showWorkspaces} onToggle={() => setShowWorkspaces(!showWorkspaces)}>
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
      </CollapsibleSection>

      <CollapsibleSection title="전체보기" isOpen={showZoneList} onToggle={() => setShowZoneList(!showZoneList)}>
        <AllZonesList openZoneEditor={(cid: string, wid: string) => { setSelectedCategoryId(cid); setSelectedWorkspaceId(wid); setZoneModalOpen(true) }} />
      </CollapsibleSection>

      <CollapsibleSection title="사이드바 설정" isOpen={showSidebar} onToggle={() => setShowSidebar(!showSidebar)}>
        <SidebarSettings />
      </CollapsibleSection>

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

function CollapsibleSection({ title, isOpen, onToggle, children }: { title: string, isOpen: boolean, onToggle: () => void, children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
      <button 
        onClick={onToggle}
        className="flex w-full items-center justify-between p-4 hover:bg-slate-50 transition-colors"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className={`text-xl transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      <div className={`transition-all duration-200 ${isOpen ? 'block' : 'hidden'}`}>
        <div className="border-t p-0">
          {children}
        </div>
      </div>
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
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
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
            placeholder="팀명, 작업장, 카테고리 등으로 검색..." 
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
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                <th className="px-4 py-2 border-b">프로젝트명</th>
                <th className="px-4 py-2 border-b">브랜드</th>
                <th className="px-4 py-2 border-b">카테고리</th>
                <th className="px-4 py-2 border-b">작업장</th>
                <th className="px-4 py-2 border-b">파트/팀</th>
                <th 
                  className="px-4 py-2 border-b cursor-pointer hover:bg-slate-100 transition-colors group"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  <div className="flex items-center gap-1">
                    기간
                    <span className={`text-[10px] transition-colors ${sortOrder === 'asc' ? 'text-brand-600' : 'text-slate-300 group-hover:text-slate-500'}`}>▲</span>
                    <span className={`text-[10px] transition-colors ${sortOrder === 'desc' ? 'text-brand-600' : 'text-slate-300 group-hover:text-slate-500'}`}>▼</span>
                  </div>
                </th>
                <th className="px-4 py-2 border-b">담당자</th>
                <th className="px-4 py-2 border-b text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {filteredZones.map(z => {
                const ws = workspaces.find(w => w.id === z.workspaceId)
                const cat = categories.find(c => c.id === ws?.categoryId)
                return (
                  <tr key={z.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700 font-medium">{z.project || '-'}</td>
                    <td className="px-4 py-3">
                      <span 
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: z.color || '#327fff' }}
                      >
                        {BRAND_CONFIG[z.brand || '']?.name || z.brand || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{cat?.name || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{ws?.name || '-'}</td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: z.color || '#327fff' }} />
                      <span className="font-medium">{z.team || z.name}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {z.startDate || '미정'} ~ {z.endDate || '미정'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{z.manager || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button 
                        onClick={() => ws && openZoneEditor(ws.categoryId, ws.id)}
                        className="rounded border border-brand-200 bg-brand-50 px-2 py-1 text-xs text-brand-700 hover:bg-brand-100"
                      >
                        편집
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filteredZones.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
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
          openZoneEditor={openZoneEditor}
        />
      )}
    </div>
  )
}

function CalendarView({ zones, currentDate, setCurrentDate, workspaces, openZoneEditor }: { 
  zones: Zone[], 
  currentDate: Date, 
  setCurrentDate: (d: Date) => void,
  workspaces: Workspace[],
  openZoneEditor: (cid: string, wid: string) => void
}) {
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
                        
                        return (
                          <div 
                            key={z.id}
                            className="pointer-events-auto cursor-pointer text-[10px] text-white px-2 truncate flex items-center shadow-sm mx-0.5"
                            style={{ 
                              gridColumn: `${colStart} / span ${colSpan}`,
                              backgroundColor: z.color || '#327fff',
                              borderRadius: '4px'
                            }}
                            title={`${z.project || '프로젝트'} | ${z.team || z.name} (${z.startDate} ~ ${z.endDate})`}
                            onClick={() => {
                              const ws = workspaces.find(w => w.id === z.workspaceId)
                              ws && openZoneEditor(ws.categoryId, ws.id)
                            }}
                          >
                            <span className="font-bold whitespace-nowrap overflow-hidden text-ellipsis">
                              {z.project ? `[${z.project}] ` : ''}{z.team || z.name}
                            </span>
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
    const name = prompt('작업장 명칭을 입력하세요')?.trim()
    if (!name) return
    const docRef = await addDoc(collection(db, 'workspaces'), { name, categoryId: selectedCategoryId, updatedAt: Date.now() })
    setSelectedWorkspaceId(docRef.id)
  }

  const deleteWorkspace = async () => {
    if (!selectedWorkspaceId) return alert('삭제할 작업장을 선택하세요')
    const ws = workspaces.find(w => w.id === selectedWorkspaceId)
    if (!confirm(`작업장 "${ws?.name || selectedWorkspaceId}"을(를) 삭제하시겠습니까?\n해당 작업장의 모든 구역도 함께 삭제됩니다.`)) return
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
    if (!selectedWorkspaceId) return alert('작업장을 선택하세요')
    const ext = file.name.split('.').pop() || 'png'
    const r = ref(storage, `plans/${selectedWorkspaceId}.${ext}`)
    const res = await uploadBytes(r, file)
    const url = await getDownloadURL(res.ref)
    await setDoc(doc(db, 'workspaces', selectedWorkspaceId), { planUrl: url, updatedAt: Date.now() }, { merge: true })
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">작업장/카테고리 관리</h2>
        <div className="flex items-center gap-2">
          <button className="rounded border px-3 py-1 text-sm" onClick={createCategory}>카테고리 추가</button>
          <button className="rounded border px-3 py-1 text-sm" onClick={createWorkspace}>작업장 추가</button>
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
    // 실시간으로 모든 구역을 구독하여 작업장별로 분류 (미니 프리뷰용)
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
          }}>새 작업장 추가</button>
        </div>
      </div>

      <div className="space-y-4">
        {categories.map((c) => (
          <div key={c.id}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">{c.name}</div>
              <button
                className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                onClick={async () => {
                  if (!confirm(`카테고리 "${c.name}" 및 하위 모든 작업장을 삭제하시겠습니까?`)) return
                  // 하위 작업장 조회
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
                    <div className="truncate text-sm font-medium">{w.name}</div>
                    <div className="flex items-center gap-1">
                      <button
                        title="작업장 삭제"
                        aria-label="작업장 삭제"
                        className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                        onClick={async () => {
                          if (!confirm(`작업장 "${w.name}" 을(를) 삭제하시겠습니까?\n해당 작업장의 모든 구역도 함께 삭제됩니다.`)) return
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

                  {w.planUrl ? (
                    <a className="text-xs text-brand-700 underline" href={w.planUrl} target="_blank">도면 보기</a>
                  ) : (
                    <div className="text-xs text-slate-500">도면 없음</div>
                  )}
                </div>
              ))}
              {(byCategory[c.id] || []).length === 0 && (
                <div className="rounded border p-2 text-xs text-slate-500">작업장 없음</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">새 작업장 추가</h3>
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

                <label className="col-span-1">작업장 명칭</label>
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
                  if (!modalWorkspaceName.trim()) { alert('작업장 명칭을 입력하세요'); return }
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
                    alert(e?.message || '작업장 생성에 실패했습니다.')
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
    if (!activeWorkspaceId) return alert('상단에서 작업장을 선택하세요')
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
        <div className="text-sm text-slate-600">상단에서 작업장을 선택하세요.</div>
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


