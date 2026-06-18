"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function logIn() {
    setLoading(true); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setMsg(error.message);
    router.push("/portfolio");
  }

  async function signUp() {
    setLoading(true); setMsg(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return setMsg(error.message);
    if (data.session) router.push("/portfolio");
    else setMsg("Account created. Check your email to confirm, then log in.");
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 380, margin: "40px auto" }}>
      <h1>Log in or Sign up</h1>
      <input placeholder="Email" type="email" value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: "10px 14px", fontSize: 16, border: "1px solid #ccc", borderRadius: 8, marginBottom: 10 }} />
      <input placeholder="Password" type="password" value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", padding: "10px 14px", fontSize: 16, border: "1px solid #ccc", borderRadius: 8, marginBottom: 16 }} />
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={logIn} disabled={loading}
          style={{ flex: 1, padding: "10px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
          {loading ? "..." : "Log in"}
        </button>
        <button onClick={signUp} disabled={loading}
          style={{ flex: 1, padding: "10px", background: "#fff", color: "#2563eb", border: "1px solid #2563eb", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
          Sign up
        </button>
      </div>
      {msg && <p style={{ color: "#c00", fontSize: 14, marginTop: 12 }}>{msg}</p>}
    </main>
  );
}