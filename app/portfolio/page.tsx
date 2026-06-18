"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PetLite = { id: number; name: string; icon_url: string | null };
type Item = {
  rowId: number;            // the portfolio_items row id (for deleting)
  petId: number; name: string; icon_url: string | null;
  variantLabel: string; unitValue: number; quantity: number;
};

const VARIANTS = [
  { key: "normal",  label: "Normal",     neon: "normal", fly: false, ride: false },
  { key: "fly",     label: "Fly",        neon: "normal", fly: true,  ride: false },
  { key: "ride",    label: "Ride",       neon: "normal", fly: false, ride: true  },
  { key: "flyride", label: "Fly & Ride", neon: "normal", fly: true,  ride: true  },
  { key: "neon",    label: "Neon",       neon: "neon",   fly: false, ride: false },
  { key: "mega",    label: "Mega",       neon: "mega",   fly: false, ride: false },
];

export default function Portfolio() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [pets, setPets] = useState<PetLite[]>([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<PetLite | null>(null);
  const [variant, setVariant] = useState(VARIANTS[0]);
  const [quantity, setQuantity] = useState(1);
  const [items, setItems] = useState<Item[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<{ ts: number; value: number }[]>([]);
  const [premium, setPremium] = useState(false);

  // load this user's net-worth history
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUserId(data.user?.id ?? null);
      if (data.user) {
        const { data: prof } = await supabase
          .from("profiles").select("premium").eq("id", data.user.id).single();
        setPremium(prof?.premium ?? false);
      }
      setAuthChecked(true);
    });
  }, []);
  // who's logged in?
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setAuthChecked(true);
    });
  }, []);

  // pet list for the picker
  useEffect(() => {
    supabase.from("pets").select("id, name, icon_url").order("name")
      .then(({ data }) => setPets(data ?? []));
  }, []);

  // load this user's saved portfolio
  useEffect(() => {
    if (!userId) return;
    async function loadItems() {
      const { data } = await supabase
        .from("portfolio_items")
        .select(`
          id, quantity,
          pet_variants (
            neon, fly, ride,
            pets ( id, name, icon_url ),
            current_pet_values ( value )
          )
        `)
        .eq("user_id", userId);

      const loaded: Item[] = (data ?? []).map((r: any) => {
        const pv = r.pet_variants;
        const label =
          pv.neon === "neon" ? "Neon" :
          pv.neon === "mega" ? "Mega" :
          pv.fly && pv.ride ? "Fly & Ride" :
          pv.fly ? "Fly" : pv.ride ? "Ride" : "Normal";
        return {
          rowId: r.id,
          petId: pv.pets.id,
          name: pv.pets.name,
          icon_url: pv.pets.icon_url,
          variantLabel: label,
          unitValue: Number(pv.current_pet_values?.[0]?.value ?? 0),
          quantity: r.quantity,
        };
      });
      setItems(loaded);
    }
    loadItems();
  }, [userId]);

  const suggestions = search
    ? pets.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  async function addToPortfolio() {
    if (!picked || !userId) return;
    const pet = picked;
    setAdding(true);
    setAddError(null);

    const { data: vRows } = await supabase
      .from("pet_variants").select("id")
      .eq("pet_id", pet.id).eq("neon", variant.neon)
      .eq("fly", variant.fly).eq("ride", variant.ride).limit(1);
    const variantId = vRows?.[0]?.id;
    if (!variantId) { setAddError(`No ${variant.label} variant exists for ${pet.name}.`); setAdding(false); return; }

    const { data: vVal } = await supabase
      .from("current_pet_values").select("value").eq("pet_variant_id", variantId).limit(1);
    const unitValue = vVal?.[0]?.value != null ? Number(vVal[0].value) : null;
    if (unitValue == null) { setAddError(`No value recorded yet for that variant.`); setAdding(false); return; }

    // save to the database
    const { data: inserted, error } = await supabase
      .from("portfolio_items")
      .insert({ user_id: userId, pet_variant_id: variantId, quantity })
      .select("id")
      .single();
    if (error) { setAddError(error.message); setAdding(false); return; }

    setItems((prev) => [...prev, {
      rowId: inserted.id, petId: pet.id, name: pet.name, icon_url: pet.icon_url,
      variantLabel: variant.label, unitValue, quantity,
    }]);
    setPicked(null); setSearch(""); setVariant(VARIANTS[0]); setQuantity(1); setAdding(false);
  }

  async function removeItem(rowId: number) {
    await supabase.from("portfolio_items").delete().eq("id", rowId);
    setItems((prev) => prev.filter((x) => x.rowId !== rowId));
  }

  const total = items.reduce((s, i) => s + i.unitValue * i.quantity, 0);

  // not logged in
  if (authChecked && !userId) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 800, margin: "40px auto", textAlign: "center" }}>
        <h1>My Portfolio</h1>
        <p style={{ color: "#666" }}>Log in to build and save your portfolio.</p>
        <a href="/login" style={{ display: "inline-block", marginTop: 12, padding: "10px 20px", background: "#2563eb", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
          Log in
        </a>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 800, margin: "0 auto" }}>
      <h1>My Portfolio</h1>
      <p style={{ color: "#666" }}>Add your pets to see your total Elve value.</p>

      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <input
          placeholder="Search a pet to add..."
          value={picked ? picked.name : search}
          onChange={(e) => { setPicked(null); setSearch(e.target.value); }}
          style={{ width: "100%", padding: "10px 14px", fontSize: 16, border: "1px solid #ccc", borderRadius: 8 }}
        />
        {!picked && suggestions.length > 0 && (
          <div style={{ border: "1px solid #eee", borderRadius: 8, marginTop: 4 }}>
            {suggestions.map((p) => (
              <div key={p.id} onClick={() => { setPicked(p); setSearch(""); }}
                style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                {p.icon_url && <img src={p.icon_url} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />}
                {p.name}
              </div>
            ))}
          </div>
        )}

        {picked && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {VARIANTS.map((v) => (
                <button key={v.key} onClick={() => setVariant(v)}
                  style={{
                    padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                    border: variant.key === v.key ? "2px solid #2563eb" : "1px solid #ccc",
                    background: variant.key === v.key ? "#eff6ff" : "#fff",
                  }}>{v.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label>Qty:
                <input type="number" min={1} value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                  style={{ width: 64, padding: "6px 8px", marginLeft: 6, border: "1px solid #ccc", borderRadius: 6 }} />
              </label>
              <button onClick={addToPortfolio} disabled={adding}
                style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                {adding ? "Adding..." : `Add ${picked.name}`}
              </button>
            </div>
            {addError && <p style={{ color: "red", fontSize: 13 }}>{addError}</p>}
          </div>
        )}
      </div>

      {premium ? (
        snapshots.length > 0 && (
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ color: "#666", fontSize: 14, marginBottom: 8 }}>Net Worth Over Time</div>
            {snapshots.length === 1 ? (
              <p style={{ color: "#888", fontSize: 13 }}>One data point so far — your line fills in as daily snapshots accumulate.</p>
            ) : (
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={snapshots}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="ts" tickFormatter={(t) => new Date(t).toLocaleDateString()} fontSize={12} />
                    <YAxis tickFormatter={(v) => v.toLocaleString()} fontSize={12} width={70} />
                    <Tooltip labelFormatter={(t) => new Date(t).toLocaleString()} formatter={(v: any) => [Number(v).toLocaleString(), "Net Worth"]} />
                    <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )
      ) : (
        <div style={{ border: "1px dashed #ccc", borderRadius: 12, padding: 20, marginBottom: 20, textAlign: "center", background: "#fafafa" }}>
          <div style={{ fontWeight: 600 }}>📈 Net Worth Over Time 🔒</div>
          <p style={{ color: "#888", fontSize: 13, margin: "6px 0 12px" }}>See how your account value changes over time with Premium.</p>
          <button onClick={() => alert("Premium checkout coming soon — Stripe will go here.")}
            style={{ padding: "8px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            Upgrade to Premium
          </button>
        </div>
      )}

      <div style={{ background: "#eff6ff", borderRadius: 12, padding: 20, marginBottom: 20, textAlign: "center" }}>
        <div style={{ color: "#666", fontSize: 14 }}>Total Portfolio Value</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#2563eb" }}>{total.toLocaleString()}</div>
        <div style={{ color: "#888", fontSize: 13 }}>{items.length} pet{items.length !== 1 ? "s" : ""}</div>
      </div>

      {items.length === 0 ? (
        <p style={{ color: "#888", textAlign: "center" }}>No pets added yet. Search above to add some.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((i) => (
            <div key={i.rowId} style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
              {i.icon_url && <img src={i.icon_url} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{i.name}</div>
                <div style={{ color: "#888", fontSize: 13 }}>{i.variantLabel} · {i.unitValue.toLocaleString()} each</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700 }}>{(i.unitValue * i.quantity).toLocaleString()}</div>
                <div style={{ color: "#888", fontSize: 13 }}>×{i.quantity}</div>
              </div>
              <button onClick={() => removeItem(i.rowId)}
                style={{ border: "none", background: "#fee", color: "#c00", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}