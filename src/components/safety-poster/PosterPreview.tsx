'use client'

import type { ComponentType } from 'react'
import * as Icons from 'lucide-react'
import type { IconName, PosterContent } from '@/lib/safetyPosterTypes'

interface PosterPreviewProps {
  content: PosterContent
  isGenerating?: boolean
}

export function PosterPreview({ content }: PosterPreviewProps) {
  return (
    <div
      id="safety-poster"
      className="w-full max-w-[800px] mx-auto aspect-[3/4.2] bg-white p-[8%] flex flex-col gap-6 border border-black overflow-hidden text-black leading-tight"
    >
      <div className="flex justify-start items-center border-b-2 border-black pb-2">
        <div className="text-[0.65rem] font-black uppercase tracking-widest bg-black text-white px-2 py-0.5">
          {content.sloganTop}
        </div>
      </div>

      <div className="mt-4 border-b-[10px] border-black pb-6">
        <h1 className="text-[3.8rem] leading-[1.05] font-[900] tracking-[-0.04em] uppercase whitespace-pre-line">
          {content.mainTitle}
        </h1>
        <div className="mt-6 flex justify-between items-end">
          <p className="text-[1.2rem] font-black max-w-[70%]">{content.subTitle}</p>
          <div className="text-[0.65rem] font-black text-right uppercase border-l-2 border-black pl-4">
            {content.sloganRight.split('\n').map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <h2 className="text-lg font-[900] uppercase tracking-tight shrink-0">핵심 3대 수칙</h2>
          <div className="flex-1 h-[2px] bg-black" />
        </div>

        <div className="grid grid-cols-3 divide-x-2 divide-black/10">
          {content.coreActions.slice(0, 3).map((action, idx) => (
            <div key={idx} className="flex flex-col gap-3 text-center px-4">
              <div className="flex items-center justify-center">
                <div className="w-28 h-28 bg-black flex items-center justify-center text-white shadow-lg overflow-hidden">
                  {action.imageUrl ? (
                    <img
                      src={action.imageUrl}
                      alt={action.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <IconRenderer name={action.iconName as IconName} size={60} strokeWidth={1.5} />
                  )}
                </div>
              </div>
              <div className="space-y-0.5">
                <h3 className="text-[1.1rem] font-[900] uppercase tracking-tighter leading-none mb-1">
                  {action.title}
                </h3>
                <p className="text-[0.65rem] font-bold leading-tight opacity-70 whitespace-pre-line break-keep">
                  {action.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-6 border-t-4 border-black">
        <div className="grid grid-cols-2 gap-x-12 gap-y-4">
          {content.detailedRules.map((rule, idx) => (
            <div key={rule.id} className="flex items-start gap-4 py-2 border-b border-black/10">
              <span className="text-[0.7rem] font-black flex-shrink-0 pt-0.5">
                {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
              </span>
              <p className="text-[0.7rem] font-black uppercase leading-tight">{rule.content}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 flex justify-between items-end border-t-2 border-black pt-4">
        <div className="text-[0.6rem] font-black uppercase tracking-wider">{content.footerLine}</div>
        <div className="text-[1.2rem] font-[900] tracking-tighter uppercase">{content.organization}</div>
      </div>
    </div>
  )
}

function IconRenderer({ name, ...props }: { name: IconName } & Record<string, unknown>) {
  const IconComponent =
    ((Icons as unknown) as Record<string, ComponentType<Record<string, unknown>>>)[name] ||
    Icons.AlertCircle
  return <IconComponent {...props} />
}
