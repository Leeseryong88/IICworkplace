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
  }

  const loadPoster = (item: SafetyPosterRecord) => {
    setCurrentId(item.id)
    setDocName(item.name)
    setContent(clonePosterContent(item.content))
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
      }
    } catch (e) {
      console.error(e)
      setError('저장에 실패했습니다. (용량·네트워크·권한을 확인하세요.)')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 항목을 삭제할까요?')) return
    setError(null)
    try {
      await deleteDoc(doc(db, 'safety_posters', id))
      if (currentId === id) {
        newDraft()
      }
    } catch (e) {
      console.error(e)
      setError('삭제에 실패했습니다.')
    }
  }

  const handleExportPdf = async () => {
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
      <div className="p-4 sm:p-6 border-b border-slate-200 bg-white/80 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">안전수칙 포스터</h2>
          <p className="text-sm text-slate-500 mt-1">
            편집 후 Firestore에 저장해 두었다가 다시 불러와 수정할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">문서 이름</label>
            <input
              type="text"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
              placeholder="예: 5층 실험실 안전수칙"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {currentId ? '저장(업데이트)' : '새로 저장'}
            </button>
            <button
              type="button"
              onClick={newDraft}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FilePlus className="w-4 h-4" />
              새로 만들기
            </button>
            {currentId && (
              <span className="self-center text-xs text-slate-500">불러온 문서: 편집 후 다시 저장하면 업데이트됩니다.</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex flex-col max-h-80 lg:max-h-none">
          <div className="p-3 border-b border-slate-100 font-semibold text-slate-800 text-sm flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-slate-500" />
            저장된 안전수칙
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {listLoading && (
              <div className="flex items-center gap-2 text-slate-500 text-sm p-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                불러오는 중…
              </div>
            )}
            {!listLoading && savedList.length === 0 && (
              <p className="text-sm text-slate-500 p-2">저장된 항목이 없습니다. 문서 이름을 정한 뒤 저장하세요.</p>
            )}
            {savedList.map((item) => {
              const t = item.updatedAt?.toDate?.() || item.createdAt?.toDate?.() || null
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border p-2 text-sm ${
                    currentId === item.id ? 'border-brand-500 bg-brand-50' : 'border-slate-100 bg-slate-50/80'
                  }`}
                >
                  <div className="font-medium text-slate-800 truncate" title={item.name}>
                    {item.name}
                  </div>
                  {t && (
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {format(t, 'yyyy.MM.dd HH:mm', { locale: ko })}
                    </div>
                  )}
                  <div className="flex gap-1 mt-2">
                    <button
                      type="button"
                      onClick={() => loadPoster(item)}
                      className="flex-1 text-xs font-semibold py-1.5 rounded bg-slate-800 text-white hover:bg-slate-700"
                    >
                      불러오기
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-black pb-2">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-black/40 italic">미리보기</h3>
              <div className="flex flex-wrap items-center gap-2">
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
                  disabled={isProcessingPdf}
                  className="inline-flex items-center gap-2 bg-black text-white px-4 py-2 font-black uppercase text-[0.6rem] tracking-widest hover:bg-white hover:text-black border-2 border-black transition-all shadow-lg disabled:opacity-50"
                >
                  <Download className="w-3 h-3" />
                  PDF 내보내기
                </button>
              </div>
            </div>
            <div className="bg-[#EAEAEA] p-6 sm:p-12 border-2 border-dashed border-black/10 flex items-center justify-center min-h-[400px]">
              <div className="relative group w-full flex justify-center">
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
