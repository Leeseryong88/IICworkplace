import type { Timestamp } from 'firebase/firestore'
import * as Icons from 'lucide-react'

export type IconName = keyof typeof Icons

export interface CoreAction {
  iconName: string
  imageUrl?: string
  title: string
  description: string
}

export interface DetailedRule {
  id: number
  content: string
}

export interface PosterContent {
  organization: string
  mainTitle: string
  subTitle: string
  sloganTop: string
  sloganRight: string
  footerLine: string
  coreActions: CoreAction[]
  detailedRules: DetailedRule[]
}

/** Firestore `safety_posters` 문서 (클라이언트에서 id 합성) */
export interface SafetyPosterRecord {
  id: string
  name: string
  content: PosterContent
  createdAt?: Timestamp | null
  updatedAt?: Timestamp | null
}

export function clonePosterContent(c: PosterContent): PosterContent {
  return JSON.parse(JSON.stringify(c)) as PosterContent
}

export const INITIAL_POSTER_CONTENT: PosterContent = {
  organization: 'IICOMBINED',
  mainTitle: '당신의 안전이\n우리의 기준입니다',
  subTitle: '모두가 안전해야, 모두가 함께할 수 있습니다.',
  sloganTop: 'SAFETY IS OUR CULTURE',
  sloganRight: 'BE SAFE\nWORK SAFE\nHOME SAFE',
  footerLine: 'SAFETY FIRST, ALWAYS.',
  coreActions: [
    {
      iconName: 'HardHat',
      title: '보호구 착용',
      description: '지정된 보호구를 반드시 착용합니다. (고무장갑, 보안경, Mask 등)',
    },
    {
      iconName: 'ShieldAlert',
      title: '얼굴 · 신체 노출 금지',
      description: 'Hood 개구면 주위에 흡입 방해물이 있는지 확인하고, 얼굴을 대지 않습니다.',
    },
    {
      iconName: 'Wrench',
      title: '작업 후 정리',
      description: '작업 후에는 손발을 깨끗이 씻고, 작업장 주위를 정리 · 정돈합니다.',
    },
  ],
  detailedRules: [
    { id: 1, content: '작업시작 전 지정된 안전 보호구를 착용한다.' },
    { id: 2, content: '배기장치의 가동 유무를 확인한다.' },
    { id: 3, content: 'Hood 개구면 주위에 흡입 방해물이 있는지 확인한다.' },
    { id: 4, content: '중량을 운반시에는 2인 1조로 작업한다.' },
    { id: 5, content: '약품은 작업용도 외 사용을 금한다.' },
    { id: 6, content: '도급 작업시에는 Hood 개구면 부근에 얼굴을 내밀지 않는다.' },
    { id: 7, content: '약품은 지정된 장소 외에는 보관을 금한다.' },
    { id: 8, content: '약품보관 장소 Key는 반드시 담당관리자가 보관한다.' },
    { id: 9, content: '작업장 내에서 음식물을 먹거나 보관하지 않는다.' },
    { id: 10, content: '작업후에는 손발을 깨끗이 씻는다.' },
    { id: 11, content: '약품이 신체에 접촉했을 때는 즉시 깨끗한 물로 15분 이상 씻어낸다.' },
    { id: 12, content: '작업장 주위환경을 항상 정리 · 정돈한다.' },
  ],
}
