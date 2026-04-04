(() => {
  const roots = document.querySelectorAll("[data-pet-portal]");
  if (!roots.length) return;
  const DEBUG = true;
  const allowedPhotoExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
  const maxPhotoBytes = 900 * 1024;

  const dogBreeds = ["Labrador Retriever", "Golden Retriever", "German Shepherd", "Border Collie", "Cocker Spaniel", "Springer Spaniel", "French Bulldog", "Bulldog", "Beagle", "Dachshund", "Poodle", "Cockapoo", "Labradoodle", "Cavapoo", "Cavalier King Charles Spaniel", "Staffordshire Bull Terrier", "Chihuahua", "Pomeranian", "Siberian Husky", "Corgi", "Mixed Breed", "Other"];
  const catBreeds = ["British Shorthair", "Ragdoll", "Maine Coon", "Persian", "Siamese", "Bengal", "Sphynx", "Scottish Fold", "Russian Blue", "Norwegian Forest Cat", "Abyssinian", "Birman", "Mixed Breed", "Other"];

  const createEmptyPet = () => ({
    id: `pet-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    firstName: "",
    lastName: "",
    petName: "",
    petType: "dog",
    breed: "",
    gender: "unknown",
    birthday: "",
    adoptionDate: "",
    weightKg: "",
    photoPath: "",
  });

  roots.forEach((root) => {
    const appProxy = root.getAttribute("data-app-proxy") || "/apps/pet-portal";
    const appProxyApi = root.getAttribute("data-app-proxy-api") || `${appProxy.replace(/\/$/, "")}/api`;
    const customerIdHint = (root.getAttribute("data-customer-id") || "").trim();
    const customerEmailHint = (root.getAttribute("data-customer-email") || "").trim();
    const switcher = root.querySelector("[data-switcher]");
    const actionToggle = root.querySelector("[data-action-toggle]");
    const actionMenu = root.querySelector("[data-action-menu]");
    const actionAdd = root.querySelector("[data-action-add]");
    const actionEdit = root.querySelector("[data-action-edit]");
    const actionDelete = root.querySelector("[data-action-delete]");
    const card = root.querySelector("[data-card]");
    const empty = root.querySelector("[data-empty]");
    const globalMessage = root.querySelector("[data-global-message]");
    const note = root.querySelector("[data-note]");
    const drawer = root.querySelector("[data-drawer]");
    const drawerBackdrop = root.querySelector("[data-drawer-backdrop]");
    const drawerTitle = root.querySelector("[data-drawer-title]");
    const drawerClose = root.querySelector("[data-drawer-close]");
    const dialog = root.querySelector("[data-dialog]");
    const dialogBackdrop = root.querySelector("[data-dialog-backdrop]");
    const dialogCancel = root.querySelector("[data-dialog-cancel]");
    const dialogConfirm = root.querySelector("[data-dialog-confirm]");
    const form = root.querySelector("[data-form]");
    const submitLabel = root.querySelector("[data-submit-label]");
    const photoInput = root.querySelector("[data-photo-input]");
    const photoButton = root.querySelector("[data-photo-button]");
    const photoName = root.querySelector("[data-photo-name]");

    const fieldPetName = root.querySelector("[data-field='petName']");
    const fieldPetType = root.querySelector("[data-field='petType']");
    const fieldOwner = root.querySelector("[data-field='owner']");
    const fieldBreed = root.querySelector("[data-field='breed']");
    const fieldGender = root.querySelector("[data-field='gender']");
    const fieldBirthday = root.querySelector("[data-field='birthday']");
    const fieldAdoption = root.querySelector("[data-field='adoptionDate']");
    const fieldWeight = root.querySelector("[data-field='weight']");
    const photoPreview = root.querySelector("[data-photo-preview]");
    const photoLetter = root.querySelector("[data-photo-letter]");

    let pets = [];
    let activeId = "";
    let mode = "create";
    let draft = createEmptyPet();
    let selectedPhoto = null;
    let loggedIn = true;
    let globalMessageTimer = null;

    const portalToBody = (element) => {
      if (!element || element.dataset.portalMounted === "true") return;
      document.body.appendChild(element);
      element.dataset.portalMounted = "true";
    };

    const showInlineMessage = (text) => {
      if (!note) return;
      note.hidden = !text;
      note.textContent = text || "";
    };

    const clearGlobalMessage = () => {
      if (!globalMessage) return;
      if (globalMessageTimer) {
        clearTimeout(globalMessageTimer);
        globalMessageTimer = null;
      }
      globalMessage.hidden = true;
      globalMessage.textContent = "";
      globalMessage.classList.remove("is-success", "is-error");
    };

    const showGlobalMessage = (text, type) => {
      if (!globalMessage || !text) return;
      if (globalMessageTimer) {
        clearTimeout(globalMessageTimer);
      }
      globalMessage.hidden = false;
      globalMessage.textContent = text;
      globalMessage.classList.remove("is-success", "is-error");
      globalMessage.classList.add(type === "success" ? "is-success" : "is-error");
      const ttl = type === "success" ? 3000 : 6000;
      globalMessageTimer = setTimeout(() => {
        clearGlobalMessage();
      }, ttl);
    };

    const activePet = () => pets.find((pet) => pet.id === activeId) || pets[0] || null;

    const fileToDataUrl = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(new Error("Failed to read selected photo."));
        reader.readAsDataURL(file);
      });

    const createApiError = (message, code, requestId) => {
      const error = new Error(message || "Request failed.");
      error.code = code || "";
      error.requestId = requestId || "";
      return error;
    };

    const postAction = async (fd) => {
      if (DEBUG) {
        console.log("[PetPortal][request]", {
          url: appProxyApi,
          intent: fd.get("intent"),
          mode: fd.get("mode"),
          id: fd.get("id"),
          photoAttached: fd.get("photo") instanceof File,
          customerIdHint: customerIdHint || null,
        });
      }

      if (customerIdHint && !fd.get("customer_id_hint")) {
        fd.set("customer_id_hint", customerIdHint);
      }
      if (customerEmailHint && !fd.get("customer_email_hint")) {
        fd.set("customer_email_hint", customerEmailHint);
      }

      const response = await fetch(appProxyApi, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: fd,
      });
      const requestIdHeader = response.headers.get("x-pet-portal-request-id");

      if (DEBUG) {
        console.log("[PetPortal][response-meta]", {
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get("content-type"),
          routeHeader: response.headers.get("x-pet-portal-route"),
          resultHeader: response.headers.get("x-pet-portal-result"),
          requestId: requestIdHeader,
          redirected: response.redirected,
          finalUrl: response.url,
        });
      }

      const rawBody = await response.text().catch(() => "");
      if (DEBUG) {
        console.log("[PetPortal][response-text]", rawBody.slice(0, 500));
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const body = rawBody.slice(0, 220);
        if (DEBUG) {
          console.error("[PetPortal][non-json-response]", body);
        }
        throw new Error(
          `Server returned non-JSON response (${response.status}). ${body || "No response body."}${
            requestIdHeader ? ` [requestId: ${requestIdHeader}]` : ""
          }`,
        );
      }

      const routeHeader = response.headers.get("x-pet-portal-route");
      if (!routeHeader) {
        throw new Error(
          "App proxy did not reach the app backend. Please ensure the app is installed and `shopify app dev` is running.",
        );
      }

      let payload = null;
      try {
        payload = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        payload = null;
      }
      if (DEBUG) {
        console.log("[PetPortal][response-json]", payload);
      }
      if (!payload) throw new Error(`Unexpected JSON response (${response.status}).`);
      if (!response.ok || !payload.ok) {
        const codeText = payload.code ? ` [code: ${payload.code}]` : "";
        const reqIdText = payload.requestId || requestIdHeader ? ` [requestId: ${payload.requestId || requestIdHeader}]` : "";
        throw createApiError(
          `${payload.message || "Request failed."}${codeText}${reqIdText}`,
          payload.code || "",
          payload.requestId || requestIdHeader || "",
        );
      }
      return payload;
    };

    const renderSwitcher = () => {
      if (!switcher) return;
      switcher.innerHTML = "";
      pets.forEach((pet) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = pet.petName || "Unnamed pet";
        if (pet.id === activeId) button.classList.add("active");
        button.addEventListener("click", () => {
          activeId = pet.id;
          render();
        });
        switcher.appendChild(button);
      });
    };

    const renderCard = () => {
      const pet = activePet();
      if (!pet || !pet.id) {
        card.hidden = true;
        empty.hidden = false;
        empty.textContent = loggedIn
          ? "No pet profiles yet. Use Action to add the first one."
          : "Please sign in or create an account to manage your pet profile.";
        return;
      }

      card.hidden = false;
      empty.hidden = true;
      fieldPetName.textContent = pet.petName || "Unnamed";
      fieldPetType.textContent = pet.petType;
      fieldOwner.textContent = `${pet.firstName} ${pet.lastName}`.trim() || "N/A";
      fieldBreed.textContent = pet.breed || "N/A";
      fieldGender.textContent = pet.gender || "N/A";
      fieldBirthday.textContent = pet.birthday || "N/A";
      fieldAdoption.textContent = pet.adoptionDate || "N/A";
      fieldWeight.textContent = pet.weightKg ? `${pet.weightKg} kg` : "N/A";

      if (pet.photoDataUrl) {
        photoPreview.src = pet.photoDataUrl;
        photoPreview.hidden = false;
        photoLetter.hidden = true;
      } else {
        photoPreview.hidden = true;
        photoLetter.hidden = false;
        photoLetter.textContent = (pet.petName || "P").slice(0, 1);
      }
    };

    const render = () => {
      renderSwitcher();
      renderCard();
      const pet = activePet();
      actionToggle.disabled = !loggedIn;
      actionEdit.disabled = !loggedIn || !pet;
      actionDelete.disabled = !loggedIn || !pet;
    };

    const refreshPets = async () => {
      empty.hidden = false;
      empty.textContent = "Loading pet profiles...";
      try {
        const fd = new FormData();
        fd.set("intent", "list");
        const data = await postAction(fd);
        pets = data.pets || [];
        activeId = pets.find((pet) => pet.id === activeId)?.id || pets[0]?.id || "";
        loggedIn = true;
        render();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to load pet profiles.";
        loggedIn = !msg.toLowerCase().includes("sign in");
        pets = [];
        activeId = "";
        showGlobalMessage(msg, "error");
        render();
      }
    };

    const setDrawerOpen = (open) => {
      drawer.hidden = !open;
      drawerBackdrop.hidden = !open;
      drawer.classList.toggle("open", open);
      drawerBackdrop.classList.toggle("open", open);
    };

    const setDialogOpen = (open) => {
      dialog.hidden = !open;
      dialogBackdrop.hidden = !open;
      dialogBackdrop.classList.toggle("open", open);
    };

    const setBreedOptions = () => {
      const breed = form.querySelector("[name='breed']");
      const type = form.querySelector("[name='petType']").value;
      const options = type === "dog" ? dogBreeds : type === "cat" ? catBreeds : [];
      breed.innerHTML = "";

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = type === "other" ? "Not applicable" : "Please select";
      breed.appendChild(placeholder);

      if (type === "other") {
        breed.disabled = true;
      } else {
        breed.disabled = false;
        options.forEach((item) => {
          const opt = document.createElement("option");
          opt.value = item;
          opt.textContent = item;
          breed.appendChild(opt);
        });
      }

      breed.value = draft.breed || "";
    };

    const bindDraftToForm = () => {
      form.querySelector("[name='firstName']").value = draft.firstName || "";
      form.querySelector("[name='lastName']").value = draft.lastName || "";
      form.querySelector("[name='petName']").value = draft.petName || "";
      form.querySelector("[name='petType']").value = draft.petType || "dog";
      form.querySelector("[name='gender']").value = draft.gender || "unknown";
      form.querySelector("[name='birthday']").value = draft.birthday || "";
      form.querySelector("[name='adoptionDate']").value = draft.adoptionDate || "";
      form.querySelector("[name='weightKg']").value = draft.weightKg || "";
      setBreedOptions();
      photoName.textContent = draft.photoPath ? "Current photo attached" : "";
      selectedPhoto = null;
      photoInput.value = "";
    };

    actionToggle.addEventListener("click", () => {
      actionMenu.hidden = !actionMenu.hidden;
    });

    actionAdd.addEventListener("click", () => {
      mode = "create";
      draft = createEmptyPet();
      drawerTitle.textContent = "Add a new pet";
      submitLabel.textContent = "Save profile";
      actionMenu.hidden = true;
      bindDraftToForm();
      setDrawerOpen(true);
    });

    actionEdit.addEventListener("click", () => {
      const pet = activePet();
      if (!pet) return;
      mode = "edit";
      draft = { ...pet };
      drawerTitle.textContent = "Edit pet";
      submitLabel.textContent = "Update profile";
      actionMenu.hidden = true;
      bindDraftToForm();
      setDrawerOpen(true);
    });

    actionDelete.addEventListener("click", () => {
      actionMenu.hidden = true;
      setDialogOpen(true);
    });

    drawerClose.addEventListener("click", () => setDrawerOpen(false));
    drawerBackdrop.addEventListener("click", () => setDrawerOpen(false));

    dialogCancel.addEventListener("click", () => setDialogOpen(false));
    dialogBackdrop.addEventListener("click", () => setDialogOpen(false));

    dialogConfirm.addEventListener("click", async () => {
      const pet = activePet();
      if (!pet) return;
      try {
        const fd = new FormData();
        fd.set("intent", "delete");
        fd.set("id", pet.id);
        fd.set("photoPath", pet.photoPath || "");
        await postAction(fd);
        showGlobalMessage("Pet profile removed.", "success");
        setDialogOpen(false);
        await refreshPets();
      } catch (error) {
        showGlobalMessage(error instanceof Error ? error.message : "Failed to delete pet profile.", "error");
      }
    });

    form.querySelector("[name='petType']").addEventListener("change", (event) => {
      draft.petType = event.target.value;
      draft.breed = "";
      setBreedOptions();
    });

    photoButton.addEventListener("click", () => photoInput.click());

    photoInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
      if (!allowedPhotoExtensions.has(extension)) {
        selectedPhoto = null;
        photoInput.value = "";
        photoName.textContent = "";
        showInlineMessage("Only .jpg, .jpeg, .png, .gif, and .webp image formats are allowed.");
        return;
      }
      if (file.size >= maxPhotoBytes) {
        selectedPhoto = null;
        photoInput.value = "";
        photoName.textContent = "";
        showInlineMessage("Image size must be smaller than 900KB.");
        return;
      }
      selectedPhoto = file;
      photoName.textContent = file.name;
      showInlineMessage("");
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const buildSaveFormData = async (withBase64) => {
        const fd = new FormData(form);
        fd.set("intent", "save");
        fd.set("mode", mode);
        fd.set("id", mode === "edit" ? draft.id : createEmptyPet().id);
        fd.set("photoPath", draft.photoPath || "");
        fd.set("pageUrl", window.location.href);
        if (selectedPhoto) {
          const extension = selectedPhoto.name.includes(".") ? selectedPhoto.name.split(".").pop().toLowerCase() : "";
          if (!allowedPhotoExtensions.has(extension)) {
            showInlineMessage("Only .jpg, .jpeg, .png, .gif, and .webp image formats are allowed.");
            return null;
          }
          if (selectedPhoto.size >= maxPhotoBytes) {
            showInlineMessage("Image size must be smaller than 900KB.");
            return null;
          }
          fd.set("photo_selected", "1");
          fd.set("photo", selectedPhoto);
          fd.set("photoFileName", selectedPhoto.name || "photo.jpg");
          fd.set("photoMimeType", selectedPhoto.type || "application/octet-stream");
          if (withBase64) {
            fd.set("photoBase64", await fileToDataUrl(selectedPhoto));
          }
        }
        return fd;
      };

      try {
        const primaryFd = await buildSaveFormData(false);
        if (!primaryFd) return;

        let data;
        try {
          data = await postAction(primaryFd);
        } catch (error) {
          const code = error && typeof error === "object" ? error.code : "";
          const shouldRetryWithBase64 = selectedPhoto && (code === "PHOTO_UPLOAD_FAILED" || code === "PHOTO_UPLOAD_MISSING");
          if (!shouldRetryWithBase64) throw error;

          const retryFd = await buildSaveFormData(true);
          if (!retryFd) return;
          data = await postAction(retryFd);
        }

        showGlobalMessage(data.message || (mode === "create" ? "New pet profile added." : "Pet profile updated."), "success");
        showInlineMessage("");
        setDrawerOpen(false);
        await refreshPets();
      } catch (error) {
        showGlobalMessage(error instanceof Error ? error.message : "Failed to save pet profile.", "error");
      }
    });

    form.addEventListener("reset", () => {
      draft = createEmptyPet();
      setTimeout(bindDraftToForm, 0);
    });

    // Move overlays out of section stacking context so they always render above theme header.
    portalToBody(drawerBackdrop);
    portalToBody(drawer);
    portalToBody(dialogBackdrop);
    portalToBody(dialog);

    refreshPets();
    setDrawerOpen(false);
    setDialogOpen(false);
  });
})();
