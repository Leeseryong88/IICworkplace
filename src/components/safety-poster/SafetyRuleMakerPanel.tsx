'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { motion } from 'motion/react'
import { Plus, Download, Save, FilePlus, FolderOpen, Trash2, AlertCircle, Loader2 } from 'lucide-react'
import { PosterPreview } from './PosterPreview'
import { PosterEditor } from './PosterEditor'
import {
  INITIAL_POSTER_CONTENT,
  clonePosterContent,
  type PosterContent,
  type SafetyPosterRecord,
} from '@/lib/safetyPosterTypes'
import { db } from '@/lib/firebase'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'

function toRecord(id: string, data: Record<string, unknown>): SafetyPosterRecord {
  return {
    id,
    name: (data.name as string) || '제목 없음',
    content: data.content as PosterContent,
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  }
}

export function SafetyRuleMakerPanel() {
  const [content, setContent] = useState<PosterContent>(() => clonePosterContent(INITIAL_POSTER_CONTENT))
  const [docName, setDocName] = useState('새 안전수칙')
  const [currentId, setCurrentId] = useState<string | null>(null)
  /** true: 미리보기 표시 (목록에서 선택했거나, 새 문서를 첫 저장한 직후) */
  const [showPreview, setShowPreview] = useState(false)
  /** 새로 만들기 직후 ~ 첫 저장 전 */
  const [isDraftMode, setIsDraftMode] = useState(false)
  const [savedList, setSavedList] = useState<SafetyPosterRecord[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isProcessingPdf, setIsProcessingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpdate = useCallback((data: Partial<PosterContent>) => {
    setContent((prev) => ({ ...prev, ...data }))
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'safety_posters'), orderBy('updatedAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: SafetyPosterRecord[] = []
        snap.forEach((d) => {
          const data = d.data()
          if (data.content) list.push(toRecord(d.id, data as Record<string, unknown>))
        })
        setSavedList(list)
        setListLoading(false)
      },
      (err) => {
        console.error(err)
        setError('저장 목록을 불러오지 못했습니다. 권한과 Firestore 규칙을 확인하세요.')
        setListLoading(false)
      }
    )
    return () => unsub()
  }, [])

  const newDraft = () => {
    setCurrentId(null)
    setContent(clonePosterContent(INITIAL_POSTER_CONTENT))
    setDocName('새 안전수칙')
    setShowPreview(false)
    setIsDraftMode(true)
  }

  const loadPoster = (item: SafetyPosterRecord) => {
    setCurrentId(item.id)
    setDocName(item.name)
    setContent(clonePosterContent(item.content))
    setShowPreview(true)
    setIsDraftMode(false)
  }

  const handleSave = async () => {
    const name = docName.trim() || '제목 없음'
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name,
        content: JSON.parse(JSON.stringify(content)) as PosterContent,
        updatedAt: serverTimestamp(),
      }
      if (currentId) {
        await updateDoc(doc(db, 'safety_posters', currentId), payload)
      } else {
        const ref = await addDoc(collection(db, 'safety_posters'), {
          ...payload,
          createdAt: serverTimestamp(),
        })
        setCurrentId(ref.id)
        setIsDraftMode(false)
        setShowPreview(true)
      }
    } catch (e) {
      console.error(e)
      setError('저장에 실패했습니다. (용량·네트워크·권한을 확인하세요.)')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!window.confirm('이 항목을 삭제할까요?')) return
    setError(null)
    try {
      await deleteDoc(doc(db, 'safety_posters', id))
      if (currentId === id) {
        setCurrentId(null)
        setContent(clonePosterContent(INITIAL_POSTER_CONTENT))
        setDocName('새 안전수칙')
        setShowPreview(false)
        setIsDraftMode(false)
      }
    } catch (err) {
      console.error(err)
      setError('삭제에 실패했습니다.')
    }
  }

  const handleExportPdf = async () => {
    if (!showPreview) {
      setError('미리보기가 켜진 뒤에 PDF로 내보낼 수 있습니다. (저장하거나 목록에서 선택하세요.)')
      return
    }
    const element = document.getElementById('safety-poster')
    if (!element) return

    setIsProcessingPdf(true)
    setError(null)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        /** 캡처 클론에서 상단 배지 영역이 잘리지 않도록 */
        onclone: (_doc, cloned) => {
          cloned.style.overflow = 'visible'
          const badgeRow = cloned.firstElementChild as HTMLElement | null
          if (badgeRow) badgeRow.style.overflow = 'visible'
        },
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height],
      })

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height)
      const safe = docName.replace(/[\\/:*?"<>|]/g, '_') || 'safety_poster'
      pdf.save(`${safe}.pdf`)
    } catch (err) {
      console.error(err)
      setError('PDF 생성 중 오류가 발생했습니다.')
    } finally {
      setIsProcessingPdf(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex flex-col bg-[#F2F2F2]">
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex flex-col max-h-80 lg:max-h-none">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="font-semibold text-slate-800 text-sm flex items-center gap-2 min-w-0">
              <FolderOpen className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="truncate">저장된 안전수칙</span>
            </div>
            <button
              type="button"
              onClick={newDraft}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FilePlus className="w-3.5 h-3.5" />
              새로 만들기
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {listLoading && (
              <div className="flex items-center gap-2 text-slate-500 text-sm p-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                불러오는 중…
              </div>
            )}
            {!listLoading && savedList.length === 0 && (
              <p className="text-sm text-slate-500 p-2">저장된 항목이 없습니다. &quot;새로 만들기&quot;로 첫 문서를 만들 수 있습니다.</p>
            )}
            {savedList.map((item) => {
              const t = item.updatedAt?.toDate?.() || item.createdAt?.toDate?.() || null
              const isActive = currentId === item.id
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => loadPoster(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      loadPoster(item)
                    }
                  }}
                  className={`rounded-lg border p-2 text-sm text-left w-full cursor-pointer transition-colors ${
                    isActive ? 'border-brand-500 bg-brand-50' : 'border-slate-100 bg-slate-50/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-800 truncate" title={item.name}>
                        {item.name}
                      </div>
                      {t && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {format(t, 'yyyy.MM.dd HH:mm', { locale: ko })}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, item.id)}
                      className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 shrink-0"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        <div className="flex-1 overflow-auto p-4 sm:p-8 flex flex-col items-center min-h-0">
          <div className="w-full max-w-4xl space-y-6">
            {!isDraftMode && !showPreview && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-slate-600 text-sm">
                왼쪽 <strong>저장된 안전수칙</strong>에서 항목을 선택하면 미리보기가 나타납니다. 새 문서는{' '}
                <strong>새로 만들기</strong>로 시작하세요.
              </div>
            )}

            {(isDraftMode || showPreview) && (
              <>
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-600">문서 이름</label>
                  <input
                    type="text"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                    placeholder="예: 5층 실험실 안전수칙"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-black pb-2">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-black/40 italic">
                    {showPreview ? '미리보기' : '새 문서 (이름을 정하고 저장하세요)'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 font-black uppercase text-[0.6rem] tracking-widest border-2 border-brand-600 hover:bg-brand-700 transition-all shadow-lg disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      저장하기
                    </button>
                    {showPreview && (
                      <>
                        <button
                          type="button"
                          onClick={() => setIsEditorOpen(true)}
                          className="inline-flex items-center gap-2 bg-black text-white px-4 py-2 font-black uppercase text-[0.6rem] tracking-widest hover:bg-white hover:text-black border-2 border-black transition-all shadow-lg"
                        >
                          <Plus className="w-3 h-3" />
                          에디터 열기
                        </button>
                        <button
                          type="button"
                          onClick={handleExportPdf}
                          disabled={isProcessingPdf || !showPreview}
                          className="inline-flex items-center gap-2 bg-black text-white px-4 py-2 font-black uppercase text-[0.6rem] tracking-widest hover:bg-white hover:text-black border-2 border-black transition-all shadow-lg disabled:opacity-50"
                          title={!showPreview ? '미리보기가 있을 때 PDF로 내보낼 수 있습니다' : undefined}
                        >
                          <Download className="w-3 h-3" />
                          PDF 내보내기
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {showPreview && (
              <div className="bg-[#EAEAEA] p-4 sm:p-8 border-2 border-dashed border-black/10 flex items-start justify-center min-h-0 max-w-full">
                <div className="w-full max-w-full flex justify-center py-2">
                  <div className="relative group w-full max-w-[800px] border border-black shadow-sm">
                    <PosterPreview content={content} />
                    <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex flex-col sm:flex-row gap-2 opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setIsEditorOpen(true)}
                        className="bg-black text-white px-3 py-1.5 sm:px-6 sm:py-2 font-black uppercase text-[0.55rem] sm:text-[0.6rem] tracking-widest border-2 border-black shadow-xl lg:hidden"
                      >
                        편집
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isDraftMode && !showPreview && (
              <p className="text-sm text-slate-500">
                문서 이름을 정한 뒤 <strong>저장하기</strong>를 누르면 Firestore에 저장되고, 아래에 미리보기가 열리며{' '}
                <strong>에디터 열기</strong>로 내용을 이어서 편집할 수 있습니다.
              </p>
            )}
          </div>
        </div>
      </div>

      <PosterEditor
        content={content}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onUpdate={handleUpdate}
        isProcessing={saving || isProcessingPdf}
      />

      {error && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 bg-red-600 text-white px-6 py-4 rounded-lg shadow-2xl max-w-[90vw]"
        >
          <AlertCircle className="w-6 h-6 shrink-0" />
          <span className="font-bold text-sm">{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-2 font-bold underline shrink-0">
            닫기
          </button>
        </motion.div>
      )}

      {(isProcessingPdf || saving) && (
        <div className="fixed inset-0 z-[200] bg-white/20 backdrop-blur-[2px] cursor-wait pointer-events-none" />
      )}
    </div>
  )
}
