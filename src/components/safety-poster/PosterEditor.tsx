'use client'

import type { ComponentType } from 'react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Image } from 'lucide-react'
import * as Icons from 'lucide-react'
import type { IconName, PosterContent } from '@/lib/safetyPosterTypes'

interface PosterEditorProps {
  content: PosterContent
  isOpen: boolean
  onClose: () => void
  onUpdate: (data: Partial<PosterContent>) => void
  isProcessing: boolean
}

export function PosterEditor({ content, isOpen, onClose, onUpdate, isProcessing }: PosterEditorProps) {
  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-hidden"
      >
        <motion.div
          initial={{ y: 50, scale: 0.95 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 50, scale: 0.95 }}
          className="bg-[#F2F2F2] w-full max-w-[1300px] h-full max-h-[96vh] flex flex-col shadow-[20px_20px_0px_rgba(0,0,0,0.2)] overflow-hidden border-2 border-black"
        >
          <div className="flex justify-between items-center px-6 py-3 border-b-2 border-black bg-white text-black">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-black flex items-center justify-center text-white font-black text-[10px]">
                S_G
              </div>
              <h2 className="text-lg font-[900] uppercase tracking-[-0.02em]">안전 수칙 에디터</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-black hover:text-white transition-all border-2 border-transparent hover:border-black"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <InputGroup
                  label="조직/기업 이름"
                  value={content.organization}
                  onChange={(val) => onUpdate({ organization: val })}
                />
                <InputGroup
                  label="하단 푸터 문구"
                  value={content.footerLine}
                  onChange={(val) => onUpdate({ footerLine: val })}
                />
                <div className="space-y-1">
                  <label className="text-[0.6rem] font-black uppercase tracking-[0.2em] opacity-60">
                    포스터 메인 문구
                  </label>
                  <textarea
                    value={content.mainTitle}
                    onChange={(e) => onUpdate({ mainTitle: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border-2 border-black font-[900] text-xl tracking-tighter uppercase focus:outline-none bg-white resize-none leading-tight"
                  />
                </div>
              </div>
              <div className="space-y-4">
                <InputGroup
                  label="설명 서브타이틀"
                  value={content.subTitle}
                  onChange={(val) => onUpdate({ subTitle: val })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <InputGroup
                    label="상단 레이블"
                    value={content.sloganTop}
                    onChange={(val) => onUpdate({ sloganTop: val })}
                  />
                  <div className="space-y-1">
                    <label className="text-[0.6rem] font-black uppercase tracking-[0.2em] opacity-60">우측 슬로건</label>
                    <textarea
                      value={content.sloganRight}
                      onChange={(e) => onUpdate({ sloganRight: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-1.5 border-2 border-black font-black text-[10px] uppercase focus:outline-none bg-white resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-black uppercase tracking-widest">핵심 3대 수칙</h3>
                <div className="flex-1 h-px bg-black/20" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {content.coreActions.map((action, idx) => (
                  <div key={idx} className="bg-white p-4 border-2 border-black space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b border-black/10">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-40">0{idx + 1}</span>
                      <div className="flex gap-2">
                        <input
                          type="file"
                          id={`core-image-${idx}`}
                          className="hidden"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              const reader = new FileReader()
                              reader.onloadend = () => {
                                const newActions = [...content.coreActions]
                                newActions[idx].imageUrl = reader.result as string
                                onUpdate({ coreActions: newActions })
                              }
                              reader.readAsDataURL(file)
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById(`core-image-${idx}`)?.click()}
                          className={`w-10 h-10 border-2 border-black flex items-center justify-center transition-all ${
                            action.imageUrl ? 'bg-black text-white' : 'bg-white text-black hover:bg-black hover:text-white'
                          }`}
                          title="이미지 업로드"
                        >
                          <Image className="w-5 h-5" />
                        </button>
                        <IconSelector
                          current={action.iconName as IconName}
                          onSelect={(name) => {
                            const newActions = [...content.coreActions]
                            newActions[idx].iconName = name
                            newActions[idx].imageUrl = undefined
                            onUpdate({ coreActions: newActions })
                          }}
                        />
                      </div>
                    </div>
                    <input
                      type="text"
                      value={action.title}
                      onChange={(e) => {
                        const newActions = [...content.coreActions]
                        newActions[idx].title = e.target.value
                        onUpdate({ coreActions: newActions })
                      }}
                      className="w-full text-sm font-[900] uppercase tracking-tight focus:outline-none bg-transparent"
                    />
                    <textarea
                      value={action.description}
                      onChange={(e) => {
                        const newActions = [...content.coreActions]
                        newActions[idx].description = e.target.value
                        onUpdate({ coreActions: newActions })
                      }}
                      rows={2}
                      className="w-full text-[0.65rem] font-bold uppercase leading-tight opacity-70 focus:outline-none bg-transparent resize-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-black uppercase tracking-widest">세부 안전수칙</h3>
                <div className="flex-1 h-px bg-black/20" />
                <button
                  type="button"
                  onClick={() => {
                    const nextId =
                      content.detailedRules.length > 0
                        ? Math.max(...content.detailedRules.map((r) => r.id)) + 1
                        : 1
                    onUpdate({ detailedRules: [...content.detailedRules, { id: nextId, content: '' }] })
                  }}
                  className="px-3 py-1 bg-black text-white text-[10px] font-black uppercase border-2 border-black hover:bg-white hover:text-black transition-all"
                >
                  수칙 추가
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {content.detailedRules.map((rule, idx) => (
                  <div
                    key={rule.id}
                    className="flex gap-2 items-center bg-white p-2 border-2 border-black group hover:border-red-500 transition-all"
                  >
                    <span className="text-[10px] font-black shrink-0">
                      {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                    </span>
                    <textarea
                      value={rule.content}
                      onChange={(e) => {
                        const newRules = [...content.detailedRules]
                        newRules[idx].content = e.target.value
                        onUpdate({ detailedRules: newRules })
                      }}
                      rows={1}
                      className="flex-1 text-[0.65rem] font-black uppercase focus:outline-none bg-transparent resize-none leading-tight"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newRules = content.detailedRules.filter((_, i) => i !== idx)
                        onUpdate({ detailedRules: newRules })
                      }}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t-2 border-black bg-white flex justify-end items-center">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-8 py-2.5 bg-black text-white border-2 border-black font-black uppercase text-xs tracking-widest hover:bg-white hover:text-black transition-all shadow-[4px_4px_0px_rgba(0,0,0,1)] disabled:opacity-50"
            >
              편집 완료 [완료]
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function InputGroup({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (val: string) => void
}) {
  return (
    <div className="space-y-1">
      <label className="text-[0.6rem] font-black uppercase tracking-[0.2em] opacity-60">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border-2 border-black font-black uppercase text-xs tracking-tight focus:outline-none bg-white"
      />
    </div>
  )
}

const ICON_LIST: IconName[] = [
  'HardHat',
  'ShieldAlert',
  'Wrench',
  'Construction',
  'Zap',
  'Flame',
  'Thermometer',
  'Wind',
  'Droplets',
  'Eye',
  'Stethoscope',
  'Volume2',
  'CigaretteOff',
  'Hand',
  'Siren',
  'Info',
  'AlertTriangle',
  'Lock',
  'PlugZap',
  'User',
  'Skull',
  'Biohazard',
  'Radiation',
  'Factory',
  'Truck',
  'Scale',
  'Anchor',
  'Hammer',
  'Boxes',
  'Package',
  'ClipboardList',
  'CheckCircle2',
  'XCircle',
  'Ban',
  'Activity',
  'Ear',
  'EarOff',
  'LifeBuoy',
  'Snowflake',
  'Sun',
  'Umbrella',
  'UtilityPole',
  'Waves',
  'Trash2',
  'Dna',
] as IconName[]

function IconSelector({ current, onSelect }: { current: IconName; onSelect: (name: IconName) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-10 h-10 border-2 border-black flex items-center justify-center text-black hover:bg-black hover:text-white transition-all bg-white"
      >
        <IconRenderer name={current} size={20} strokeWidth={2.5} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 p-3 bg-white border-2 border-black shadow-[10px_10px_0px_rgba(0,0,0,1)] grid grid-cols-6 gap-2 z-[70] w-[300px] max-h-[300px] overflow-y-auto">
          {ICON_LIST.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                onSelect(name)
                setOpen(false)
              }}
              className={`aspect-square p-1 border-2 flex items-center justify-center transition-all ${
                current === name ? 'bg-black text-white border-black' : 'text-black border-transparent hover:border-black'
              }`}
              title={name}
            >
              <IconRenderer name={name} size={20} strokeWidth={2} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function IconRenderer({ name, ...props }: { name: IconName } & Record<string, unknown>) {
  const IconComponent =
    ((Icons as unknown) as Record<string, ComponentType<Record<string, unknown>>>)[name] ||
    Icons.AlertCircle
  return <IconComponent {...props} />
}
