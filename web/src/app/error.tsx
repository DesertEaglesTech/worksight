"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="fatal"><h1>The workspace could not load</h1><p>Please try again. Your saved profiles remain in the inspection service.</p><button className="button primary" onClick={reset}>Try again</button></main>; }
