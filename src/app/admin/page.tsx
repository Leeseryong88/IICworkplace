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

const FLOORS: FloorId[] = ['5F', '6F', '7F']

const PRESET_COLORS = [
  { name: '파랑 (기본)', value: '#327fff' },
  { name: '빨강', value: '#ef4444' },
  { name: '초록', value: '#22c55e' },
  { name: '노랑', value: '#eab308' },
  { name: '보라', value: '#a855f7' },
  { name: '주황', value: '#f97316' },
  { name: '회색', value: '#64748b' },
  { name: '검정', value: '#0f172a' },
]

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

      <WorkspacesOverview
        selectedCategoryId={selectedCategoryId}
        setSelectedCategoryId={setSelectedCategoryId}
        setSelectedWorkspaceId={setSelectedWorkspaceId}
        openZoneEditor={(cid: string, wid: string) => { setSelectedCategoryId(cid); setSelectedWorkspaceId(wid); setZoneModalOpen(true) }}
      />
      <SidebarSettings />
      {zoneModalOpen && (
        <ZoneEditorModal activeWorkspaceId={selectedWorkspaceId} onClose={() => setZoneModalOpen(false)} />
      )}
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
}: {
  selectedCategoryId: string
  setSelectedCategoryId: (v: string) => void
  setSelectedWorkspaceId: (v: string) => void
  openZoneEditor: (categoryId: string, workspaceId: string) => void
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
    // 각 작업장의 구역을 한 번씩 가져와 미니 프리뷰에 사용
    (async () => {
      const results: Record<string, Zone[]> = {}
      for (const w of workspaces) {
        try {
          const zs = await getDocs(query(collection(db, 'zones'), where('workspaceId', '==', w.id), orderBy('updatedAt', 'desc')))
          const list: Zone[] = []
          zs.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }))
          results[w.id] = list
        } catch (_) {
          results[w.id] = []
        }
      }
      setZonesByWs(results)
    })()
  }, [workspaces])

  const byCategory: Record<string, Workspace[]> = {}
  for (const w of workspaces) {
    if (!byCategory[w.categoryId]) byCategory[w.categoryId] = []
    byCategory[w.categoryId].push(w)
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">작업장 관리</h2>
        <button className="rounded-md bg-brand-600 px-3 py-1 text-sm text-white" onClick={() => { 
          const defaultCat = selectedCategoryId || (categories[0]?.id || '');
          setModalSelectedCategoryId(defaultCat); 
          setModalNewCategory(''); 
          setShowModal(true); 
        }}>새 작업장 추가</button>
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
                      <img src={w.planUrl} alt="plan" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-500">도면 없음</div>
                    )}
                    {/* 미니 오버레이 */}
                    {w.planUrl && (
                      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 750" preserveAspectRatio="xMidYMid meet">
                        {(zonesByWs[w.id] || []).map((z) => (
                          z.rect ? (
                            <rect key={z.id} x={z.rect.x * 1000} y={z.rect.y * 750} width={z.rect.width * 1000} height={z.rect.height * 750} fill={z.color || '#327fff'} fillOpacity={0.15} stroke={z.color || '#327fff'} strokeWidth={1} rx={4} ry={4} />
                          ) : null
                        ))}
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

function ZoneEditor({ activeWorkspaceId }: { activeWorkspaceId: string }) {
  const [planUrl, setPlanUrl] = useState<string | undefined>('')
  const [zones, setZones] = useState<Zone[]>([])
  const [editing, setEditing] = useState<Zone | null>(null)
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number }>({ w: 1000, h: 750 })
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)

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
      color: '#327fff',
      workspaceId: activeWorkspaceId,
      points: [],
      rect: undefined,
      startDate: '',
      endDate: '',
      updatedAt: Date.now(),
      active: true,
    })
  }

  const saveZone = async (z: Zone) => {
    if (!z.name && !z.team) return alert('팀/구역명을 입력하세요')
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
              {zones.map((z) => (
                z.rect ? (
                  <g key={z.id}>
                    <rect x={z.rect.x * imgNatural.w} y={z.rect.y * imgNatural.h} width={z.rect.width * imgNatural.w} height={z.rect.height * imgNatural.h} fill={z.color || '#327fff'} fillOpacity={0.2} stroke={z.color || '#327fff'} strokeWidth={2} rx={6} ry={6} />
                    <text x={(z.rect.x + z.rect.width / 2) * imgNatural.w} y={(z.rect.y + z.rect.height / 2) * imgNatural.h} textAnchor="middle" dominantBaseline="middle" fontSize={14} fill="#0f172a">
                      {(z.team || z.name) + (z.purpose ? ` · ${z.purpose}` : '')}
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

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold">구역 목록</h3>
            <button className="rounded-md bg-brand-600 px-3 py-1 text-sm text-white" onClick={startNewZone}>새 구역</button>
          </div>
          <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
            {zones.map((z) => (
              <div key={z.id} className="rounded border p-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: z.color || '#327fff' }} />
                    <div className="text-sm font-medium">{z.team || z.name}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button className="rounded border px-2 py-0.5" onClick={() => setEditing({ ...z })}>편집</button>
                    <button className="rounded border px-2 py-0.5 text-red-600" onClick={() => removeZone(z.id)}>삭제</button>
                  </div>
                </div>
                {z.purpose && <div className="mt-1 text-xs text-slate-600">{z.purpose}</div>}
              </div>
            ))}
            {zones.length === 0 && <div className="text-sm text-slate-500">등록된 구역이 없습니다.</div>}
          </div>

          {editing && (
            <div className="mt-4 space-y-2 rounded-lg border p-3">
              <h4 className="font-semibold">구역 속성</h4>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <label className="col-span-1 self-center">프로젝트명</label>
                <input className="col-span-2 rounded border px-2 py-1" value={editing.project || ''}
                  onChange={(e) => setEditing({ ...editing, project: e.target.value })} />

                <label className="col-span-1 self-center">팀/구역명</label>
                <input className="col-span-2 rounded border px-2 py-1" value={editing.team || editing.name}
                  onChange={(e) => setEditing({ ...editing, team: e.target.value, name: e.target.value })} />

                <label className="col-span-1 self-center">색상</label>
                <div className="col-span-2 space-y-1">
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        title={c.name}
                        className={`h-7 w-7 rounded-full border-2 transition-all hover:scale-110 ${
                          editing.color === c.value ? 'border-slate-900 ring-2 ring-slate-200' : 'border-slate-200'
                        }`}
                        style={{ backgroundColor: c.value }}
                        onClick={() => setEditing({ ...editing, color: c.value })}
                      />
                    ))}
                    <div className="relative h-7 w-7 overflow-hidden rounded-full border-2 border-slate-200" title="직접 선택">
                      <input 
                        type="color" 
                        className="absolute -inset-1 h-[150%] w-[150%] cursor-pointer" 
                        value={editing.color || '#327fff'}
                        onChange={(e) => setEditing({ ...editing, color: e.target.value })} 
                      />
                    </div>
                  </div>
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

                <label className="col-span-1 self-center">시작일</label>
                <input type="date" className="col-span-2 rounded border px-2 py-1" value={editing.startDate || ''}
                  onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} />

                <label className="col-span-1 self-center">종료일</label>
                <input type="date" className="col-span-2 rounded border px-2 py-1" value={editing.endDate || ''}
                  onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} />
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>사각형: {editing.rect ? `${Math.round(editing.rect.width * 100)}% × ${Math.round(editing.rect.height * 100)}%` : '미지정'}</span>
                <button className="ml-auto rounded border px-2 py-1" onClick={() => setEditing({ ...editing, rect: undefined })}>사각형 초기화</button>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button className="rounded border px-3 py-1 text-sm" onClick={() => setEditing(null)}>취소</button>
                <button className="rounded bg-brand-600 px-3 py-1 text-sm text-white" onClick={() => saveZone(editing)}>저장</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ZoneEditorModal({ activeWorkspaceId, onClose }: { activeWorkspaceId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[95vh] w-full max-w-6xl overflow-auto rounded-lg border bg-white p-4 relative">
        <button className="absolute right-3 top-3 rounded border px-2 py-1 text-sm" onClick={onClose}>닫기</button>
        <ZoneEditor activeWorkspaceId={activeWorkspaceId} />
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
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">사이드바 설정</h2>
        <button className="rounded bg-brand-600 px-3 py-1 text-sm text-white disabled:opacity-50" disabled={saving} onClick={save}>저장</button>
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


