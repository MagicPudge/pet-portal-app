import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../../shopify.server";
import { CAT_BREEDS, DOG_BREEDS } from "./constants";
import { deletePet, getCustomerId, getShopDomain, getSupabaseConfig, listPets, savePet } from "./data.server";
import { createEmptyPet } from "./model";
import type { ActionResult, Gender, PetProfile, PetType } from "./types";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  getSupabaseConfig();

  const shopDomain = getShopDomain(request, session?.shop);
  const customerId = getCustomerId(request);

  if (!shopDomain) throw new Response("Missing shop domain in app proxy request.", { status: 400 });

  return {
    shopDomain,
    customerId: customerId ?? null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const config = getSupabaseConfig();
  const customerId = getCustomerId(request);
  const shopDomain = getShopDomain(request, session?.shop);

  if (!shopDomain) {
    return Response.json({ ok: false, message: "Missing shop domain in app proxy request." }, { status: 400 });
  }
  if (!customerId) {
    return Response.json({ ok: false, message: "Please sign in to your customer account first." }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "list") {
    const pets = await listPets(config, shopDomain, customerId);
    return Response.json({ ok: true, pets });
  }

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "");
    const photoPath = String(formData.get("photoPath") ?? "");
    if (!id) return Response.json({ ok: false, message: "Missing pet id." }, { status: 400 });
    try {
      await deletePet(config, shopDomain, customerId, id, photoPath);
    } catch (error) {
      return Response.json(
        { ok: false, message: error instanceof Error ? error.message : "Failed to delete pet profile." },
        { status: 500 },
      );
    }
    return Response.json({ ok: true, message: "Pet profile removed.", deletedId: id });
  }

  if (intent !== "save") return Response.json({ ok: false, message: "Unsupported action." }, { status: 400 });
  try {
    const { pet, message } = await savePet(config, shopDomain, customerId, formData);
    return Response.json({ ok: true, message, pet });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to save pet profile.";
    const status = msg === "Please enter a pet name." ? 400 : 500;
    return Response.json({ ok: false, message: msg }, { status });
  }
};

export default function PetPortalRoute() {
  const { customerId } = useLoaderData<typeof loader>();
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [activeId, setActiveId] = useState("");
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [draft, setDraft] = useState<PetProfile>(createEmptyPet());
  const [message, setMessage] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [selectedPhotoName, setSelectedPhotoName] = useState("");
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [loadingPets, setLoadingPets] = useState(true);
  const [saving, setSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const activePet = useMemo(
    () => pets.find((pet) => pet.id === activeId) ?? pets[0] ?? null,
    [pets, activeId],
  );

  const postAction = async (formData: FormData): Promise<ActionResult> => {
    const endpoint = typeof window !== "undefined" ? window.location.href : "/apps/pet-portal";
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json().catch(() => null)) as ActionResult | null;
    if (!payload) throw new Error("Unexpected server response.");
    if (!response.ok || !payload.ok) throw new Error(payload.message || "Request failed.");
    return payload;
  };

  const fetchPets = async () => {
    if (!customerId) {
      setLoadingPets(false);
      setPets([]);
      setActiveId("");
      return;
    }

    setLoadingPets(true);
    try {
      const formData = new FormData();
      formData.set("intent", "list");
      const data = await postAction(formData);
      const nextPets = data.pets ?? [];
      setPets(nextPets);
      setActiveId((current) => (nextPets.some((pet) => pet.id === current) ? current : nextPets[0]?.id ?? ""));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load pet profiles.");
    } finally {
      setLoadingPets(false);
    }
  };

  useEffect(() => {
    void fetchPets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const beginCreate = () => {
    setMode("create");
    setDraft(createEmptyPet());
    setSelectedPhotoName("");
    setSelectedPhotoFile(null);
    setActionMenuOpen(false);
    setDrawerOpen(true);
    setMessage("");
  };

  const beginEdit = () => {
    if (!activePet) return;
    setMode("edit");
    setDraft({ ...activePet });
    setSelectedPhotoName(activePet.photoPath ? "Current photo attached" : "");
    setSelectedPhotoFile(null);
    setActionMenuOpen(false);
    setDrawerOpen(true);
    setMessage("");
  };

  const removeActive = async () => {
    if (!activePet) return;
    try {
      setSaving(true);
      const formData = new FormData();
      formData.set("intent", "delete");
      formData.set("id", activePet.id);
      formData.set("photoPath", activePet.photoPath);
      await postAction(formData);
      setConfirmOpen(false);
      setActionMenuOpen(false);
      setMessage("Pet profile removed.");
      await fetchPets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete pet profile.");
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.petName.trim()) {
      setMessage("Please enter a pet name.");
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.set("intent", "save");
      formData.set("mode", mode);
      formData.set("id", draft.id);
      formData.set("firstName", draft.firstName);
      formData.set("lastName", draft.lastName);
      formData.set("petName", draft.petName.trim());
      formData.set("petType", draft.petType);
      formData.set("breed", draft.breed);
      formData.set("gender", draft.gender);
      formData.set("birthday", draft.birthday);
      formData.set("adoptionDate", draft.adoptionDate);
      formData.set("weightKg", draft.weightKg);
      formData.set("photoPath", draft.photoPath);
      formData.set("pageUrl", typeof window !== "undefined" ? window.location.href : "");
      if (selectedPhotoFile) formData.set("photo", selectedPhotoFile);

      const data = await postAction(formData);

      setDrawerOpen(false);
      setSelectedPhotoFile(null);
      setSelectedPhotoName("");
      setDraft(createEmptyPet());
      setMessage(data.message ?? (mode === "create" ? "New pet profile added." : "Pet profile updated."));
      await fetchPets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save pet profile.");
    } finally {
      setSaving(false);
    }
  };

  const handlePhoto = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDraft((prev) => ({ ...prev, photoDataUrl: String(reader.result) }));
    };
    reader.readAsDataURL(file);
    setSelectedPhotoFile(file);
    setSelectedPhotoName(file.name);
  };

  const breedOptions = draft.petType === "dog" ? DOG_BREEDS : CAT_BREEDS;

  return (
    <main>
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap");
        .pet-portal{font-family:"Poppins","Trebuchet MS",sans-serif;color:#111;background:#f4f4f4;border:1px solid rgba(17,17,17,.1);border-radius:24px;padding:18px}
        .pet-portal .hero{background:radial-gradient(circle at top center,rgba(255,255,255,.95),transparent 40%),linear-gradient(180deg,#f8f8f8 0%,#f2f2f2 100%);border:1px solid rgba(17,17,17,.12);border-radius:18px;padding:24px 24px 18px;text-align:center}
        .pet-portal .brand-logo{width:208px;display:block;height:auto;margin:0 auto 24px;mix-blend-mode:multiply}
        .pet-portal h1{margin:0 0 10px;font-size:30px;line-height:1.12;font-weight:800}
        .pet-portal .sub{margin:0 auto;max-width:680px;font-size:14px;line-height:1.7;color:#606060}
        .pet-portal .hero-footer{margin-top:22px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
        .pet-portal .actions{position:relative;display:flex;justify-content:flex-end}
        .pet-portal .switcher{display:flex;gap:10px;flex-wrap:wrap}
        .pet-portal .button{border:none;border-radius:12px;padding:9px 14px;font-size:12px;font-weight:700;cursor:pointer;background:#111;color:#fff}
        .pet-portal .button:disabled,.pet-portal .menu-item:disabled{opacity:.5;cursor:not-allowed}
        .pet-portal .button.secondary{background:#fff;color:#111;border:1px solid rgba(17,17,17,.22)}
        .pet-portal .button.danger{background:#ffe9e9;color:#a12c2c;border:1px solid rgba(161,44,44,.3)}
        .pet-portal .menu{position:absolute;right:0;top:calc(100% + 10px);min-width:220px;background:#fff;border:1px solid rgba(17,17,17,.14);border-radius:14px;box-shadow:0 14px 28px rgba(17,17,17,.08);padding:8px;display:grid;gap:6px;z-index:10}
        .pet-portal .menu-item{width:100%;text-align:left;border:1px solid transparent;border-radius:10px;background:#fff;color:#111;padding:10px 12px;font-size:13px;font-weight:600;cursor:pointer}
        .pet-portal .menu-item:hover{background:#f5f5f5}.pet-portal .menu-item.danger{color:#a12c2c;background:#fff8f8}
        .pet-portal .switcher button{border:1px solid rgba(17,17,17,.22);border-radius:999px;background:#fff;padding:10px 18px;font-size:15px;font-weight:600;cursor:pointer}
        .pet-portal .switcher button.active{background:#111;color:#fff;border-color:#111}
        .pet-portal .card-wrap{margin-top:16px}.pet-portal .card,.pet-portal .empty{background:#fff;border:1px solid rgba(17,17,17,.2);border-radius:18px;padding:16px;box-shadow:0 8px 22px rgba(17,17,17,.06)}
        .pet-portal .empty{text-align:center;color:#666}.pet-portal .id-head{border-radius:12px;background:#111;color:#fff;padding:10px 12px;font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
        .pet-portal .card-main{margin-top:14px;display:grid;grid-template-columns:220px 1fr;gap:16px}
        .pet-portal .photo{width:220px;height:220px;border-radius:16px;border:1px solid rgba(17,17,17,.22);background:#ececec;display:grid;place-items:center;font-size:38px;font-weight:700;color:#666;overflow:hidden}
        .pet-portal .photo img{width:100%;height:100%;object-fit:cover}.pet-portal .pet-name{margin:0;font-size:28px;line-height:1.1;font-weight:800}
        .pet-portal .pill{margin-top:6px;display:inline-block;border-radius:999px;background:#111;color:#fff;padding:4px 9px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
        .pet-portal .grid{margin-top:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px 14px}
        .pet-portal .grid strong{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px;color:#1f2937}
        .pet-portal .grid span{display:block;font-size:14px;color:#4b5563;line-height:1.35}
        .pet-portal .drawer-backdrop,.pet-portal .dialog-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .2s ease}
        .pet-portal .drawer-backdrop{z-index:40}.pet-portal .dialog-backdrop{z-index:60}
        .pet-portal .drawer-backdrop.open,.pet-portal .dialog-backdrop.open{opacity:1;pointer-events:auto}
        .pet-portal .drawer{position:fixed;right:0;top:0;width:min(520px,94vw);height:100%;background:#fff;border-left:1px solid rgba(17,17,17,.16);box-shadow:-14px 0 28px rgba(17,17,17,.12);transform:translateX(100%);transition:transform .25s ease;z-index:50;padding:16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto}
        .pet-portal .drawer.open{transform:translateX(0)}.pet-portal .drawer-head,.pet-portal .row-actions{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .pet-portal .drawer-head h2{margin:0;font-size:18px;text-transform:uppercase;letter-spacing:.04em;font-weight:800}
        .pet-portal .close{border:none;background:transparent;font-size:24px;line-height:1;color:#666;cursor:pointer}
        .pet-portal form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pet-portal label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:#374151}
        .pet-portal input,.pet-portal select{height:42px;border:1px solid rgba(17,17,17,.22);border-radius:11px;padding:0 11px;font-size:13px;font-family:"Poppins","Trebuchet MS",sans-serif;background:#fff}
        .pet-portal .span-2{grid-column:1 / -1}
        .pet-portal .file-box{border:1px solid rgba(17,17,17,.18);border-radius:16px;background:#fff;padding:24px 16px 20px;text-align:center}
        .pet-portal .upload-label{align-items:center;color:#374151}.pet-portal .upload-cloud{font-size:12px;line-height:1;margin-bottom:2px;letter-spacing:.14em}
        .pet-portal .upload-title{font-size:15px;font-weight:700;color:#1f2937}.pet-portal .upload-trigger{margin-top:8px;min-width:230px}
        .pet-portal .upload-hint,.pet-portal .upload-name,.pet-portal .note{margin-top:6px;font-size:12px;color:#6b7280}.pet-portal .upload-name{word-break:break-word}
        .pet-portal .file-input-hidden{display:none}.pet-portal .dialog{position:fixed;inset:0;display:grid;place-items:center;z-index:70;pointer-events:none}
        .pet-portal .dialog-card{pointer-events:auto;width:min(420px,92vw);background:#fff;border:1px solid rgba(17,17,17,.16);border-radius:14px;padding:16px}
        .pet-portal .dialog-card h3{margin:0 0 8px;font-size:18px;text-transform:uppercase;letter-spacing:.03em}.pet-portal .dialog-card p{margin:0 0 12px;color:#555;font-size:14px}
        @media (max-width:920px){.pet-portal h1{font-size:26px}.pet-portal .brand-logo{width:176px}.pet-portal .card-main{grid-template-columns:1fr}.pet-portal .photo{width:170px;height:170px}.pet-portal .grid{grid-template-columns:1fr 1fr}}
        @media (max-width:680px){.pet-portal{padding:12px}.pet-portal .hero{padding:18px 14px 14px}.pet-portal .brand-logo{width:150px;margin-bottom:18px}.pet-portal h1{font-size:22px}.pet-portal .sub{font-size:13px}.pet-portal .hero-footer{flex-direction:column-reverse;align-items:stretch}.pet-portal .switcher,.pet-portal .actions{justify-content:center}.pet-portal .grid,.pet-portal form{grid-template-columns:1fr}}
      `}</style>

      <div className="pet-portal">
        <section className="hero">
          <img className="brand-logo" src="/poppypawz.svg" alt="PoppyPawz" />
          <h1>Welcome to the PoppyPawz pet community</h1>
          <p className="sub">
            We are glad you and your pet are here. Create a profile, keep each pet&apos;s details in one place, and stay connected with the PoppyPawz family.
          </p>
          <div className="hero-footer">
            <div className="switcher">
              {pets.map((pet) => (
                <button key={pet.id} type="button" className={pet.id === activeId ? "active" : undefined} onClick={() => setActiveId(pet.id)}>
                  {pet.petName || "Unnamed pet"}
                </button>
              ))}
            </div>
            <div className="actions">
              <button
                className="button secondary"
                type="button"
                disabled={!customerId}
                onClick={() => setActionMenuOpen((open) => !open)}
              >
                Action
              </button>
              {actionMenuOpen ? (
                <div className="menu">
                  <button className="menu-item" type="button" onClick={beginCreate}>Add new pet</button>
                  <button className="menu-item" type="button" onClick={beginEdit} disabled={!activePet}>Edit current pet</button>
                  <button className="menu-item danger" type="button" onClick={() => { setActionMenuOpen(false); setConfirmOpen(true); }} disabled={!activePet}>Delete current pet</button>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="card-wrap">
          {!customerId ? (
            <div className="empty">Please sign in or create an account to manage your pet profile.</div>
          ) : loadingPets ? (
            <div className="empty">Loading pet profiles...</div>
          ) : activePet ? (
            <article className="card">
              <div className="id-head">Pet Card</div>
              <div className="card-main">
                <div className="photo">{activePet.photoDataUrl ? <img src={activePet.photoDataUrl} alt={activePet.petName} /> : <span>{activePet.petName.slice(0, 1) || "P"}</span>}</div>
                <div>
                  <h2 className="pet-name">{activePet.petName || "Unnamed"}</h2>
                  <span className="pill">{activePet.petType}</span>
                  <div className="grid">
                    <div><strong>Owner</strong><span>{`${activePet.firstName} ${activePet.lastName}`.trim() || "N/A"}</span></div>
                    <div><strong>Breed</strong><span>{activePet.breed || "N/A"}</span></div>
                    <div><strong>Gender</strong><span>{activePet.gender}</span></div>
                    <div><strong>Birthday</strong><span>{activePet.birthday || "N/A"}</span></div>
                    <div><strong>Adoption Date</strong><span>{activePet.adoptionDate || "N/A"}</span></div>
                    <div><strong>Weight</strong><span>{activePet.weightKg ? `${activePet.weightKg} kg` : "N/A"}</span></div>
                  </div>
                </div>
              </div>
            </article>
          ) : (
            <div className="empty">No pet profiles yet. Use Action to add the first one.</div>
          )}
        </section>

        <div className={`drawer-backdrop ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)} />
        <aside className={`drawer ${drawerOpen ? "open" : ""}`}>
          <div className="drawer-head">
            <h2>{mode === "create" ? "Add a new pet" : "Edit pet"}</h2>
            <button className="close" type="button" onClick={() => setDrawerOpen(false)}>x</button>
          </div>

          <form onSubmit={onSubmit}>
            <label>First Name<input type="text" value={draft.firstName} onChange={(event) => setDraft((prev) => ({ ...prev, firstName: event.target.value }))} placeholder="First Name" /></label>
            <label>Last Name<input type="text" value={draft.lastName} onChange={(event) => setDraft((prev) => ({ ...prev, lastName: event.target.value }))} placeholder="Last Name" /></label>
            <label>Pet Name *<input type="text" required value={draft.petName} onChange={(event) => setDraft((prev) => ({ ...prev, petName: event.target.value }))} placeholder="Pet name *" /></label>
            <label>Pet Type *<select value={draft.petType} onChange={(event) => setDraft((prev) => ({ ...prev, petType: event.target.value as PetType, breed: "" }))}><option value="dog">Dog</option><option value="cat">Cat</option><option value="other">Other</option></select></label>
            <label>Gender<select value={draft.gender} onChange={(event) => setDraft((prev) => ({ ...prev, gender: event.target.value as Gender }))}><option value="female">Female</option><option value="male">Male</option><option value="unknown">Unknown</option></select></label>
            <label>{draft.petType === "cat" ? "Cat Breed" : "Dog Breed"}<select value={draft.breed} onChange={(event) => setDraft((prev) => ({ ...prev, breed: event.target.value }))} disabled={draft.petType === "other"}><option value="">{draft.petType === "other" ? "Not applicable" : "Please select"}</option>{draft.petType !== "other" && breedOptions.map((breed) => <option key={breed} value={breed}>{breed}</option>)}</select></label>
            <label>Birthday<input type="date" value={draft.birthday} onChange={(event) => setDraft((prev) => ({ ...prev, birthday: event.target.value }))} /></label>
            <label>Adoption Date<input type="date" value={draft.adoptionDate} onChange={(event) => setDraft((prev) => ({ ...prev, adoptionDate: event.target.value }))} /></label>
            <label>Weight (kg)<input type="number" min="0" max="200" step="0.1" value={draft.weightKg} onChange={(event) => setDraft((prev) => ({ ...prev, weightKg: event.target.value }))} placeholder="Weight (kg)" /></label>
            <div className="span-2 file-box">
              <label className="upload-label">
                <span className="upload-cloud">CLOUD</span>
                <span className="upload-title">Pet photo (optional)</span>
                <button className="button upload-trigger" type="button" onClick={() => photoInputRef.current?.click()} disabled={saving}>Browse for images</button>
                <input ref={photoInputRef} className="file-input-hidden" type="file" accept="image/*" onChange={(event) => handlePhoto(event.target.files?.[0])} />
                <span className="upload-hint">Max 5MB. JPG/PNG/WebP recommended.</span>
                {selectedPhotoName ? <span className="upload-name">{selectedPhotoName}</span> : null}
              </label>
            </div>
            <div className="span-2 row-actions">
              <button className="button secondary" type="button" onClick={beginCreate} disabled={saving}>Reset</button>
              <button className="button" type="submit" disabled={saving}>{saving ? "Saving..." : mode === "create" ? "Save profile" : "Update profile"}</button>
            </div>
          </form>
          {message ? <div className="note">{message}</div> : null}
        </aside>

        <div className={`dialog-backdrop ${confirmOpen ? "open" : ""}`} />
        {confirmOpen ? (
          <div className="dialog">
            <div className="dialog-card">
              <h3>Delete pet profile?</h3>
              <p>This action cannot be undone.</p>
              <div className="row-actions">
                <button className="button secondary" type="button" onClick={() => setConfirmOpen(false)} disabled={saving}>Cancel</button>
                <button className="button danger" type="button" onClick={() => void removeActive()} disabled={saving}>{saving ? "Deleting..." : "Delete"}</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
