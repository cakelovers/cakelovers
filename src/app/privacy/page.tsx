import Link from "next/link"

// Static content page. First-draft PIPA-shaped disclosure (collected
// data, purpose, retention, processors, user rights) — written to be
// factually accurate to the current architecture (Supabase + OpenAI as
// processors, no cookies/tracking yet), not a substitute for a real
// legal/compliance review before this is shown to real customers.
export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-muted-foreground underline">
          &larr; 홈으로
        </Link>
        <h1 className="text-2xl font-semibold">개인정보처리방침</h1>
        <p className="text-sm text-muted-foreground">시행일: 2026년 9월 7일</p>
      </div>

      <div className="flex flex-col gap-8 text-sm leading-relaxed">
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">1. 수집하는 개인정보 항목</h2>
          <p>
            케이크 주문 시 아래 정보를 수집합니다.
          </p>
          <ul className="list-disc pl-5">
            <li>이름</li>
            <li>연락처 (전화번호 또는 이메일)</li>
            <li>케이크 설명 (디자인 요청 내용)</li>
            <li>참고 사진 (선택 업로드 시)</li>
            <li>픽업 희망 일시</li>
            <li>주문 관련 메모 (선택 입력 시)</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">2. 개인정보의 수집 및 이용 목적</h2>
          <p>수집한 정보는 아래 목적으로만 이용합니다.</p>
          <ul className="list-disc pl-5">
            <li>주문 접수 및 처리</li>
            <li>AI 케이크 미리보기 이미지 생성</li>
            <li>픽업 일정 조율 및 안내</li>
            <li>결제 확인을 위한 연락</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">3. 개인정보의 보유 및 이용 기간</h2>
          <p>
            수집한 개인정보는 주문 처리 목적이 달성된 이후에도 분쟁 대응 및
            문의 확인을 위해 일정 기간 보관한 뒤 파기합니다. 관련 법령에
            따라 별도 보관 의무가 있는 경우 해당 기간 동안 보관합니다.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">4. 개인정보 처리위탁</h2>
          <p>서비스 운영을 위해 아래 업체에 개인정보 처리를 위탁하고 있습니다.</p>
          <ul className="list-disc pl-5">
            <li>
              <span className="font-medium">Supabase</span> — 데이터베이스,
              로그인 인증, 사진·이미지 파일 저장
            </li>
            <li>
              <span className="font-medium">OpenAI</span> — 입력하신 케이크
              설명을 바탕으로 한 AI 미리보기 이미지 생성 (설명 텍스트가
              전달됩니다)
            </li>
          </ul>
          <p>
            현재 별도의 쿠키나 방문 추적 기술은 사용하지 않습니다.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">5. 이용자의 권리</h2>
          <p>
            고객님은 언제든지 본인의 개인정보에 대한 열람, 정정, 삭제를
            요청할 수 있으며, 주문하신 매장을 통해 문의해 주시면 확인 후
            조치해 드립니다.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">6. 개인정보의 안전성 확보 조치</h2>
          <p>
            비밀번호 없는 인증, 전송 구간 암호화(HTTPS), 매장 담당자로
            제한된 접근 권한 등을 통해 개인정보를 안전하게 관리하고
            있습니다.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">7. 문의처</h2>
          <p>
            개인정보 관련 문의는 주문하신 매장으로 연락해 주시기 바랍니다.
            사업자 등록 정보는 추후 별도로 안내될 예정입니다.
          </p>
        </section>
      </div>
    </div>
  )
}
