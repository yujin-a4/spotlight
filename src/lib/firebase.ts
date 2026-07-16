import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// gcplab.me 조직 정책상 Firebase 프로젝트 등록이 불가하여
// GCP 네이티브 Firestore에 apiKey + projectId만으로 직접 연결한다.
// (이미지는 Storage 대신 base64 data URL로 문서에 내장 — page.tsx 참조)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const db = getFirestore(app);
