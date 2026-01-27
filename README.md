# Workspace Dashboard

오픈 작업실(5F/6F/7F) 현황을 시각적으로 확인/관리하는 대시보드입니다.

## 실행

```bash
npm install
npm run dev
```

## 환경변수

`env.example`를 참고해 루트에 `.env.local` 파일을 생성하세요.

중요: Firebase Storage 버킷은 보통 `<project-id>.appspot.com` 형식입니다. 제공된 값이 `*.firebasestorage.app` 인 경우 Storage SDK와 호환되지 않을 수 있으니 `workplace-management-f44dc.appspot.com`를 권장합니다.

## Firebase 보안 규칙

`firebase/firestore.rules`, `firebase/storage.rules`에 초안이 포함되어 있습니다. Firebase CLI로 배포하세요.

관리자 권한은 Firestore `roles/{uid}` 문서에 `{ role: 'admin' }`를 추가하여 부여합니다.

## 기본 기능
- 사용자: 층 선택, 도면 보기, 구역 색상/팝업 표시, 팀 필터
- 관리자: 로그인, 도면 업로드, 다각형 구역 생성/편집/삭제, 속성 편집


