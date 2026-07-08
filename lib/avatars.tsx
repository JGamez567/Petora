// Owner-curated avatar set — IMAGE-BASED.
//
// HOW TO ADD YOUR OWN PICTURES:
//   1. Put square images in the repo at  public/avatars/   (e.g. public/avatars/cow.png)
//      → 256×256 px is plenty, PNG or WebP, keep each under ~50 KB.
//   2. Add one line per image to the AVATARS list below. The `id` must match
//      the filename (id "cow" → /avatars/cow.png) and is what gets stored in
//      profiles.avatar_id, so don't rename ids once players are using them.
//   3. Deploy. The new options appear in every player's picker automatically.
//
// Removing an entry is safe — players who had it just fall back to the
// default circle. Users can ONLY pick from this list (no uploads), so nothing
// inappropriate can ever appear on the leaderboard.

export type AvatarPreset = {
  id: string;      // filename without extension — stored in profiles.avatar_id
  label: string;   // shown as tooltip / screen-reader name in the picker
  ext?: string;    // file extension, defaults to "png"
};

export const DEFAULT_GRADIENT = "linear-gradient(135deg,#3a2b66,#6d52c4)";

// ── EDIT THIS LIST ───────────────────────────────────────────────────────────
// Placeholder entries — replace with your real filenames. Each needs a
// matching image in public/avatars/ or it renders as the default circle.
export const AVATARS: AvatarPreset[] = [
  { id: "petora1", label: "unicorn" },
  { id: "petora2", label: "giantpanda" },
  { id: "petora3", label: "giraffe" },
  { id: "petora4", label: "cow" },
  { id: "petora5", label: "kangaroo" },
];
// ─────────────────────────────────────────────────────────────────────────────

export function avatarSrc(a: AvatarPreset): string {
  return `/avatars/${a.id}.${a.ext ?? "png"}`;
}

export function getAvatar(id: string | null | undefined): AvatarPreset | null {
  if (!id) return null;
  return AVATARS.find((a) => a.id === id) ?? null; // unknown/removed id → default
}

// Shared renderer used by the leaderboard, podium, modal, and picker.
// Falls back to the classic purple gradient circle when no avatar is chosen
// (or the chosen id no longer exists in the list above).
export function AvatarCircle({
  avatarId,
  className = "h-7 w-7",
}: {
  avatarId: string | null | undefined;
  className?: string;
  fontSize?: number; // accepted for compatibility with existing call sites; unused for image avatars
}) {
  const preset = getAvatar(avatarId);
  if (!preset) {
    return (
      <span
        className={`flex-none rounded-full ${className}`}
        style={{ background: DEFAULT_GRADIENT }}
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className={`grid flex-none select-none place-items-center overflow-hidden rounded-full ${className}`}
      style={{ background: DEFAULT_GRADIENT }} // backdrop behind transparent PNGs
      role="img"
      aria-label={preset.label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatarSrc(preset)} alt="" className="h-full w-full object-cover" />
    </span>
  );
}