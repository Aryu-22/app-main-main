import "./App.css";
import { Component } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { Toaster } from "sonner";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import SafeRoute from "./pages/SafeRoute";
import CrimeMap from "./pages/CrimeMap";
import Analytics from "./pages/Analytics";
import Emergency from "./pages/Emergency";
import Stations from "./pages/Stations";
import About from "./pages/About";

// ---------- Error Boundary ----------
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-slate-400 text-sm max-w-md mb-6">
            An unexpected error occurred in this page. Try refreshing, or navigate back to the Delhi safety dashboard.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-lg bg-cyan-400 text-slate-950 px-5 py-2.5 text-sm font-semibold hover:bg-cyan-300 transition-colors"
          >
            Try Again
          </button>
          {process.env.NODE_ENV === "development" && (
            <pre className="mt-6 text-left text-xs text-rose-300 bg-[#111622] border border-white/10 rounded-lg p-4 max-w-2xl overflow-auto">
              {this.state.error?.toString()}
            </pre>
          )}
        </main>
      );
    }
    return this.props.children;
  }
}

// ---------- 404 Page ----------
function NotFound() {
  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="font-mono text-8xl font-extrabold text-white/10 select-none">404</div>
      <h1 className="text-2xl font-bold text-white mt-2 mb-2">Delhi SafeCity Location Not Found</h1>
      <p className="text-slate-400 text-sm max-w-sm mb-6">
        The route or view you requested does not exist within the NCT of Delhi navigation system.
      </p>
      <Link
        to="/"
        className="rounded-lg bg-cyan-400 text-slate-950 px-5 py-2.5 text-sm font-semibold hover:bg-cyan-300 transition-colors"
      >
        Return to Overview
      </Link>
    </main>
  );
}

// ---------- App ----------
function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Nav />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/safe-route" element={<SafeRoute />} />
            <Route path="/map" element={<CrimeMap />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/emergency" element={<Emergency />} />
            <Route path="/police-stations" element={<Stations />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
        <Footer />
        <Toaster theme="dark" position="top-right" richColors closeButton />
      </BrowserRouter>
    </div>
  );
}

export default App;
