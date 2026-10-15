import { useEffect, useState } from "react";
import { formatRemaining } from "../../../lib/wizyfiTime";

/** Local-clock countdown. Display only: the SERVER decides when it runs. */
export function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(target).getTime() - now;
  return (
    <span role="timer" className="tabular-nums">
      {ms <= 0 ? "Due now — waiting for the server to run it" : formatRemaining(ms)}
    </span>
  );
}
