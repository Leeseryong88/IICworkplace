"use client";
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { collection, onSnapshot, orderBy, query, where, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Zone, Workspace, Category } from '@/lib/types'
import Image from 'next/image'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { ko } from 'date-fns/locale'
import { format, parseISO } from 'date-fns'

export default function HomePage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [activeWorkspace, setActiveWorkspace] = useState<string>('')
  const [zones, setZones] = useState<Zone[]>([])
  const [filterStartDate, setFilterStartDate] = useState<string>('')
  const [filterEndDate, setFilterEndDate] = useState<string>('')
  const [allowedCategoryIds, setAllowedCategoryIds] = useState<string[] | null>(null)
  const [sidebarOrder, setSidebarOrder] = useState<string[] | null>(null)
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({})
  const [checkedZoneIds, setCheckedZoneIds] = useState<Set<string>>(new Set())

  // 하이드레이션 오류 방지를 위해 마운트 후 날짜 설정
  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    setFilterStartDate(today)
    setFilterEndDate(today)
  }, [])

  useEffect(() => {
    const unsubCats = onSnapshot(query(collection(db, 'categories'), orderBy('name', 'asc')), (snap) => {
      const list: Category[] = []
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }))
      setCategories(list)
      if (list.length && !activeCategory) {
        const vis = (allowedCategoryIds && allowedCategoryIds.length) ? list.filter(c => allowedCategoryIds.includes(c.id)) : list
        const ordered = sidebarOrder && sidebarOrder.length ? [...vis].sort((a,b)=> (sidebarOrder.indexOf(a.id)+1||9999) - (sidebarOrder.indexOf(b.id)+1||9999)) : vis
        if (ordered.length) setActiveCategory(ordered[0].id)
      }
    })
    const unsubSettings = onSnapshot(doc(db, 'settings', 'sidebar'), (d) => {
      const data = d.exists() ? (d.data() as any) : null
      const ids = (data?.categoryIds as string[] | undefined) || null
      const ord = (data?.order as string[] | undefined) || null
      setAllowedCategoryIds(ids && ids.length ? ids : null)
      setSidebarOrder(ord && ord.length ? ord : null)
    })
    return () => { unsubCats(); unsubSettings() }
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'workspaces'), orderBy('name', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      const list: Workspace[] = []
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }))
      setWorkspaces(list)
      // 초기 선택: 현재 카테고리에 속한 첫 작업실 또는 전체 첫 작업실
      if (!activeWorkspace && list.length) {
        const firstInCat = list.find((w) => w.categoryId === activeCategory)
        setActiveWorkspace(firstInCat ? firstInCat.id : list[0].id)
      }
    })
    return () => unsub()
  }, [])

  // 카테고리 변경 시 해당 카테고리의 첫 작업실로 이동
  useEffect(() => {
    if (!activeCategory || workspaces.length === 0) return
    const belongs = workspaces.find((w) => w.id === activeWorkspace && w.categoryId === activeCategory)
    if (!belongs) {
      const first = workspaces.find((w) => w.categoryId === activeCategory)
      setActiveWorkspace(first ? first.id : '')
    }
  }, [activeCategory, workspaces])

  useEffect(() => {
    if (!activeWorkspace) return
    const q = query(collection(db, 'zones'), where('workspaceId', '==', activeWorkspace), orderBy('updatedAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      const list: Zone[] = []
      snap.forEach((d) => list.push({ ...(d.data() as any), id: d.id }))
      setZones(list)
    })
    return () => unsub()
  }, [activeWorkspace])

  const filteredZones = useMemo(() => {
    if (!filterStartDate && !filterEndDate) {
      const todayStr = format(new Date(), 'yyyy-MM-dd')
      return zones.filter(z => !z.endDate || z.endDate >= todayStr)
    }
    return zones.filter((z) => {
      // 기간이 설정되지 않은 구역은 제외할지 포함할지 결정 필요. 
      // 여기서는 기간이 있는 구역만 필터링 대상이 된다고 가정.
      if (!z.startDate || !z.endDate) return false 
      
      const start = filterStartDate || '0000-00-00'
      const end = filterEndDate || '9999-12-31'
      
      // 오버랩 로직: (구역 시작일 <= 필터 종료일) AND (구역 종료일 >= 필터 시작일)
      return z.startDate <= end && z.endDate >= start
    })
  }, [zones, filterStartDate, filterEndDate])

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

  // 도면에 표시할 구역: 날짜 필터링된 구역 중 체크된 것만
  const displayZones = useMemo(() => {
    return filteredZones.filter(z => checkedZoneIds.has(z.id))
  }, [filteredZones, checkedZoneIds])

  const activeWs = workspaces.find((w) => w.id === activeWorkspace)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b pb-2 gap-2">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 truncate">IIC작업실</h1>
        <Link href="/admin" className="shrink-0 text-xs md:text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline">관리자 모드</Link>
      </div>

      {/* 본문 레이아웃: 사이드바 + 캔버스 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 사이드바: 모바일에서는 상단에, 데스크톱에서는 좌측에 배치 */}
        <aside className="lg:col-span-3 rounded-lg border bg-white p-3">
            <h2 className="mb-2 text-base font-semibold">카테고리 및 작업실</h2>
            <div className="space-y-2 max-h-[300px] overflow-y-auto lg:max-h-none">
              {(() => {
                const base = (allowedCategoryIds && allowedCategoryIds.length ? categories.filter(c => allowedCategoryIds.includes(c.id)) : categories)
                if (!sidebarOrder || sidebarOrder.length === 0) return base
                const pos = (id: string) => {
                  const i = sidebarOrder.indexOf(id)
                  return i === -1 ? Number.MAX_SAFE_INTEGER : i
                }
                return [...base].sort((a, b) => pos(a.id) - pos(b.id))
              })().map((c) => {
                const open = true
                return (
                  <div key={c.id} className="rounded border">
                    <button
                      className={`flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium transition-colors ${open ? 'bg-slate-50 text-brand-700' : 'text-slate-700'}`}
                      onClick={() => { setActiveCategory(c.id) }}
                    >
                      <span>{c.name}</span>
                      <span className={`text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {open && (
                      <div className="border-t p-2">
                        {workspaces
                          .filter((w) => w.categoryId === c.id)
                          .map((w) => (
                            <button
                              key={w.id}
                              className={`mb-1 block w-full rounded px-3 py-2 text-left text-sm transition-colors ${activeWorkspace === w.id ? 'bg-brand-600 text-white shadow-sm' : 'hover:bg-slate-50 text-slate-700'}`}
                              onClick={() => setActiveWorkspace(w.id)}
                            >
                              {w.name}
                            </button>
                          ))}
                        {workspaces.filter((w) => w.categoryId === c.id).length === 0 && (
                          <div className="px-2 py-1 text-xs text-slate-500">작업실 없음</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </aside>

        {/* 메인 캔버스 */}
        <div className="lg:col-span-9 space-y-4">
          <div className="rounded-lg border bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">🗓️ 사용 가능 여부 확인:</span>
                <div className="relative w-full sm:w-auto">
                  <DatePicker
                    selectsRange={true}
                    startDate={filterStartDate ? parseISO(filterStartDate) : null}
                    endDate={filterEndDate ? parseISO(filterEndDate) : null}
                    onChange={(update) => {
                      const [start, end] = update;
                      setFilterStartDate(start ? format(start, 'yyyy-MM-dd') : '');
                      setFilterEndDate(end ? format(end, 'yyyy-MM-dd') : '');
                    }}
                    locale={ko}
                    dateFormat="yyyy-MM-dd"
                    isClearable={false}
                    placeholderText="날짜 범위를 선택하세요"
                    customInput={
                      <button className="flex w-full items-center justify-between gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition-all shadow-sm sm:min-w-[200px]">
                        <div className="flex items-center gap-2 text-slate-700">
                          <span className="text-lg">📅</span>
                          <span className="font-medium">
                            {filterStartDate ? (
                              filterEndDate ? `${filterStartDate} ~ ${filterEndDate}` : `${filterStartDate} ~ 선택 중...`
                            ) : '모든 날짜'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">▼</span>
                      </button>
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(filterStartDate !== format(new Date(), 'yyyy-MM-dd') || filterEndDate !== format(new Date(), 'yyyy-MM-dd')) && (
                  <button 
                    className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:text-brand-600 sm:flex-none"
                    onClick={() => { 
                      const today = format(new Date(), 'yyyy-MM-dd');
                      setFilterStartDate(today); 
                      setFilterEndDate(today);
                    }}
                  >
                    오늘로 초기화
                  </button>
                )}
                {(filterStartDate || filterEndDate) && (
                  <button 
                    className="flex-1 rounded-md border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm transition-all hover:bg-brand-100 hover:text-brand-800 sm:flex-none"
                    onClick={() => { 
                      setFilterStartDate(''); 
                      setFilterEndDate('');
                    }}
                  >
                    ✨ 모든 날짜
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="relative min-h-[500px] w-full overflow-hidden rounded-lg border bg-white shadow-md">
            {activeWs?.planUrl ? (
              <FloorCanvas planUrl={activeWs.planUrl} zones={displayZones} />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500">도면이 없습니다.</div>
            )}
          </div>
          <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border bg-white shadow-md">
              <ZoneListView 
                zones={filteredZones} 
                checkedZoneIds={checkedZoneIds} 
                onToggleZone={handleToggleZone} 
              />
            </div>
            <div className="text-right text-xs text-slate-500">
              * {filterStartDate ? '지정한 기간에 예약이 있는 구역들이 표시됩니다.' : '예약된 모든 구역이 표시됩니다.'} 체크박스를 통해 도면에 표시할 구역을 선택할 수 있습니다.
            </div>
          </div>
        </div>
      </div>

      {/* 우측 범례/필터 제거 */}
    </div>
  )
}

function ZoneListView({ 
  zones, 
  checkedZoneIds, 
  onToggleZone 
}: { 
  zones: Zone[], 
  checkedZoneIds?: Set<string>, 
  onToggleZone?: (id: string) => void 
}) {
  if (zones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <span className="text-4xl mb-4">🔍</span>
        <p>선택한 조건에 맞는 예약 정보가 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-50 text-slate-600 shadow-sm">
          <tr>
            {onToggleZone && (
              <th className="px-4 py-4 w-10">
                <div className="flex justify-center">
                  {/* 전체 선택 기능은 일단 생략하거나 간단히 구현 가능 */}
                </div>
              </th>
            )}
            <th className="px-6 py-4 font-semibold">기간</th>
            <th className="px-6 py-4 font-semibold">프로젝트명</th>
            <th className="px-6 py-4 font-semibold">담당자</th>
            <th className="px-6 py-4 font-semibold">비고</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {zones.map((z) => (
            <tr key={z.id} className="hover:bg-slate-50 transition-colors">
              {onToggleZone && (
                <td className="px-4 py-4">
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      checked={checkedZoneIds?.has(z.id) ?? true}
                      onChange={() => onToggleZone(z.id)}
                    />
                  </div>
                </td>
              )}
              <td className="px-6 py-4 text-slate-600">
                {z.startDate || z.endDate ? `${z.startDate || ''} ~ ${z.endDate || ''}` : '-'}
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full shadow-sm" style={{ backgroundColor: z.color || '#327fff' }} />
                  <span className="font-medium text-slate-900">{z.project || z.name}</span>
                </div>
              </td>
              <td className="px-6 py-4 text-slate-700">{z.manager || '-'}</td>
              <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate" title={z.note || z.purpose}>
                {z.note || z.purpose || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FloorCanvas({ planUrl, zones }: { planUrl: string; zones: Zone[] }) {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [selected, setSelected] = useState<Zone | null>(null)
  return (
    <div className="absolute inset-0">
      {/* 이미지 */}
      <Image
        src={planUrl}
        alt="floor plan"
        fill
        sizes="(max-width: 1024px) 100vw, 66vw"
        className="object-contain"
        onLoad={(e) => {
          const el = e.currentTarget
          setSize({ w: el.naturalWidth, h: el.naturalHeight })
        }}
      />

      {/* SVG 오버레이 */}
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${size.w || 1000} ${size.h || 750}`} preserveAspectRatio="xMidYMid meet">
        {zones.map((z) => {
          const color = z.color || '#327fff'
          const dateRange = z.startDate || z.endDate ? `${z.startDate || ''} ~ ${z.endDate || ''}` : ''
          const title = `${z.project || z.name}${dateRange ? `\n${dateRange}` : ''}`
          if (z.rect) {
            const x = z.rect.x * (size.w || 1000)
            const y = z.rect.y * (size.h || 750)
            const w = z.rect.width * (size.w || 1000)
            const h = z.rect.height * (size.h || 750)
            const cx = x + w / 2
            const cy = y + h / 2
            
            // 글자 크기를 구역 너비와 높이에 맞춰 유동적으로 조절
            // 가로 너비 기준: (구역 너비 / 글자 수)에 비례하되, 너무 커지지 않게 조절
            // 세로 높이 기준: 구역 높이의 25%를 넘지 않게 조절
            const textLen = (z.project || z.name).length || 1
            const horizontalLimit = (w / textLen) * 1.2 // 가로 여유 계수 하향 조정
            const verticalLimit = h * 0.25 // 세로 여유 계수 하향 조정
            
            // 최종 글자 크기: 가로/세로 제한 중 작은 값을 선택하고, 최대 14px로 제한
            const fs = Math.max(6, Math.min(horizontalLimit, verticalLimit, 14))
            const dateFs = Math.max(5, fs * 0.8)

            return (
              <g key={z.id} onClick={() => setSelected(z)} style={{ cursor: 'pointer' }}>
                <rect x={x} y={y} width={w} height={h} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={2} rx={6} ry={6}>
                  <title>{title}</title>
                </rect>
                <text 
                  x={cx} 
                  y={dateRange ? cy - dateFs * 0.5 : cy} 
                  textAnchor="middle" 
                  dominantBaseline="middle" 
                  fontSize={fs} 
                  fontWeight="bold"
                  fill="#0f172a"
                  className="pointer-events-none select-none"
                >
                  {(z.project || z.name)}
                </text>
                {dateRange && (
                  <text 
                    x={cx} 
                    y={cy + fs * 0.8} 
                    textAnchor="middle" 
                    dominantBaseline="middle" 
                    fontSize={dateFs} 
                    fill="#475569"
                    className="pointer-events-none select-none"
                  >
                    {dateRange}
                  </text>
                )}
              </g>
            )
          }
          // fallback: 기존 폴리곤 지원
          return (
            <polygon
              key={z.id}
              points={z.points.map((p) => `${p.x * (size.w || 1000)},${p.y * (size.h || 750)}`).join(' ')}
              fill={color}
              fillOpacity={0.25}
              stroke={color}
              strokeWidth={2}
              onClick={() => setSelected(z)}
              style={{ cursor: 'pointer' }}
            >
              <title>{title}</title>
            </polygon>
          )
        })}
      </svg>

      {selected && (
        <div className="absolute right-4 top-4 z-10 w-full max-w-sm rounded-lg border bg-white p-4 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-base font-semibold">{selected.project || selected.name}</div>
            <button className="rounded border px-2 py-0.5 text-xs" onClick={() => setSelected(null)}>닫기</button>
          </div>
          <div className="space-y-1 text-sm">
            {(selected.startDate || selected.endDate) && (
              <div><span className="text-slate-500">기간</span>: {(selected.startDate || '')} ~ {(selected.endDate || '')}</div>
            )}
            {selected.team && <div><span className="text-slate-500">팀</span>: {selected.team}</div>}
            {selected.manager && <div><span className="text-slate-500">담당자</span>: {selected.manager}</div>}
            {selected.purpose && (
              <div className="whitespace-pre-wrap"><span className="text-slate-500">사용 목적</span>: {selected.purpose}</div>
            )}
            {selected.note && <div className="whitespace-pre-wrap"><span className="text-slate-500">비고</span>: {selected.note}</div>}
          </div>
        </div>
      )}
    </div>
  )
}


