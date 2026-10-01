import { Routes, Route, Navigate } from "react-router-dom";

function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">
          Wizyfi
        </h1>

        <p className="mt-3 text-slate-400">
          Every Connection. Every Network. On Your Time.
        </p>

        <p className="mt-6 text-sm text-slate-500">
          Wizyfi frontend is running.
        </p>
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold">404</h1>

        <p className="mt-2 text-slate-500">
          Page not found.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />

      <Route
        path="*"
        element={<NotFoundPage />}
      />
    </Routes>
  );
}
