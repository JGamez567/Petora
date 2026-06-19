"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function signUp() {
    if (!email.trim()) return setMsg("Please enter your email.");
    if (!password) return setMsg("Please choose a password.");
    if (password.length < 6) return setMsg("Password must be at least 6 characters.");
    setLoading(true); setMsg(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) return setMsg(error.message);
    if (data.session) router.push("/portfolio");
    else setMsg("Account created. Check your email to confirm, then log in.");
  }

  const isSuccess = msg?.startsWith("Account created");

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 380, margin: "40px auto" }}>
      <h1>Sign up</h1>
      <input placeholder="Email" type="email" value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: "10px 14px", fontSize: 16, border: "1px solid #ccc", borderRadius: 8, marginBottom: 10, boxSizing: "border-box" }} />
      <div style={{ position: "relative", marginBottom: 16 }}>
        <input placeholder="Password (min 6 characters)" type={showPassword ? "text" : "password"} value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: "10px 60px 10px 14px", fontSize: 16, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" }} />
        <button type="button" onClick={() => setShowPassword((s) => !s)}
          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#2563eb", fontSize: 13, cursor: "pointer", fontWeight: 600, padding: 4 }}>
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      <button onClick={signUp} disabled={loading}
        style={{ width: "100%", padding: "10px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
        {loading ? "..." : "Create account"}
      </button>
      {msg && <p style={{ color: isSuccess ? "#16a34a" : "#c00", fontSize: 14, marginTop: 12 }}>{msg}</p>}
      <p style={{ fontSize: 14, marginTop: 16, textAlign: "center" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "#2563eb", fontWeight: 600 }}>Log in</Link>
      </p>
    </main>
  );
}