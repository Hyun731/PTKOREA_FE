"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

// 검토·시사점 is no longer a step: adoption ends in 자료 확인, headlines in 초안 흐름. Old links land there.
export default function ReviewRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/projects/${id}/materials`);
  }, [id, router]);
  return <p className="muted">자료 확인으로 이동합니다…</p>;
}
