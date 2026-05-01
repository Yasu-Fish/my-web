const MAX_IMAGE_WIDTH = 1600;
const MAX_IMAGE_HEIGHT = 1600;
const MAX_IMAGE_BYTES = 250 * 1024;
const JPEG_QUALITY_STEPS = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42];
const SECRET_TAP_RESET_MS = 1200;
const SECRET_TAP_COUNT = 3;
const REFRESH_INTERVAL_MS = 15000;
const LOCAL_STORAGE_KEY = "photoshare.local-test";
const LOCAL_CLIENT_ID_KEY = "photoshare.client-id";

const SUPABASE_URL = window.PHOTOSHARE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = window.PHOTOSHARE_SUPABASE_ANON_KEY ?? "";
const SUPABASE_BUCKET = window.PHOTOSHARE_SUPABASE_BUCKET ?? "photoshare-images";
const SUPABASE_TABLE = window.PHOTOSHARE_SUPABASE_TABLE ?? "photos";
const SUPABASE_LIKES_TABLE = window.PHOTOSHARE_SUPABASE_LIKES_TABLE ?? "photo_likes";

const homeView = document.querySelector("#homeView");
const authView = document.querySelector("#authView");
const rankingView = document.querySelector("#rankingView");
const uploadView = document.querySelector("#uploadView");
const editView = document.querySelector("#editView");
const genreButtons = document.querySelector("#genreButtons");
const homeEmptyState = document.querySelector("#homeEmptyState");
const showUploadButton = document.querySelector("#showUploadButton");
const uploadForm = document.querySelector("#uploadForm");
const genreTitleInput = document.querySelector("#genreTitle");
const genreList = document.querySelector("#genreList");
const photoNameInput = document.querySelector("#photoName");
const photoSizeInput = document.querySelector("#photoSize");
const catchDateInput = document.querySelector("#catchDate");
const photoCommentInput = document.querySelector("#photoComment");
const photoInput = document.querySelector("#photoInput");
const fileLabel = document.querySelector("#fileLabel");
const gallery = document.querySelector("#gallery");
const emptyState = document.querySelector("#emptyState");
const genreTemplate = document.querySelector("#genreTemplate");
const photoTemplate = document.querySelector("#photoCardTemplate");
const authForm = document.querySelector("#authForm");
const authEmailInput = document.querySelector("#authEmail");
const authPasswordInput = document.querySelector("#authPassword");
const signUpButton = document.querySelector("#signUpButton");
const resetPasswordButton = document.querySelector("#resetPasswordButton");
const signOutButton = document.querySelector("#signOutButton");
const signedInPanel = document.querySelector("#signedInPanel");
const currentUserEmail = document.querySelector("#currentUserEmail");
const authMessage = document.querySelector("#authMessage");
const editForm = document.querySelector("#editForm");
const editGenreTitleInput = document.querySelector("#editGenreTitle");
const editPhotoNameInput = document.querySelector("#editPhotoName");
const editPhotoSizeInput = document.querySelector("#editPhotoSize");
const editCatchDateInput = document.querySelector("#editCatchDate");
const editPhotoCommentInput = document.querySelector("#editPhotoComment");
const editPreviewImage = document.querySelector("#editPreviewImage");
const editDate = document.querySelector("#editDate");
const editDeleteButton = document.querySelector("#editDeleteButton");
const connectionNotice = document.querySelector("#connectionNotice");
const imageViewer = document.querySelector("#imageViewer");
const imageViewerImage = document.querySelector("#imageViewerImage");
const imageViewerClose = document.querySelector("#imageViewerClose");

const supabaseClient = createSupabaseClient();
const clientId = getLocalClientId();

let state = { genres: [] };
let currentUser = null;
let stateSignature = "";
let selectedGenreId = null;
let currentView = "home";
let editingPhotoId = null;
let isRefreshing = false;
let viewerTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};
let viewerGesture = {
  mode: null,
  startDistance: 0,
  startScale: 1,
  startX: 0,
  startY: 0,
  startTranslateX: 0,
  startTranslateY: 0,
};
let secretTapState = {
  photoId: null,
  count: 0,
  timerId: null,
};

showUploadButton.addEventListener("click", () => {
  if (!ensureCanMutate()) {
    return;
  }

  showView("upload");
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!ensureSupabaseConfigured()) {
    return;
  }

  await signIn();
});

signUpButton.addEventListener("click", async () => {
  if (!ensureSupabaseConfigured()) {
    return;
  }

  await signUp();
});

resetPasswordButton.addEventListener("click", async () => {
  if (!ensureSupabaseConfigured()) {
    return;
  }

  await requestPasswordReset();
});

signOutButton.addEventListener("click", async () => {
  if (!supabaseClient) {
    return;
  }

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    setConnectionNotice(getMessage(error, "ログアウトできませんでした。"), "error");
    return;
  }

  setConnectionNotice("ログアウトしました。ランキングの閲覧は続けられます。", "success");
});

document.querySelectorAll(".back-button").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view === "ranking" && !selectedGenreId) {
      showView("home");
      return;
    }

    showView(button.dataset.view);
  });
});

photoInput.addEventListener("change", () => {
  const file = photoInput.files?.[0];
  fileLabel.textContent = file ? file.name : "画像を選択";
});

imageViewer.addEventListener("click", (event) => {
  if (event.target === imageViewer) {
    closeImageViewer();
  }
});

imageViewerClose.addEventListener("click", closeImageViewer);
imageViewer.addEventListener("touchstart", handleViewerTouchStart, { passive: false });
imageViewer.addEventListener("touchmove", handleViewerTouchMove, { passive: false });
imageViewer.addEventListener("touchend", handleViewerTouchEnd);
imageViewer.addEventListener("touchcancel", handleViewerTouchEnd);

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!ensureCanMutate()) {
    return;
  }

  const file = photoInput.files?.[0];
  const genreTitle = genreTitleInput.value.trim();
  const photoName = photoNameInput.value.trim();
  const photoSize = parseSize(photoSizeInput.value);
  const catchDate = catchDateInput.value || null;
  const comment = photoCommentInput.value.trim();

  if (!file || !genreTitle || !photoName || !Number.isFinite(photoSize) || photoSize < 0) {
    alert("ジャンル、名前、サイズ、画像を入力してください。");
    return;
  }

  if (!file.type.startsWith("image/")) {
    alert("画像ファイルを選択してください。");
    return;
  }

  try {
    const optimizedImageBlob = await optimizeImageFile(file);
    
    if (!supabaseClient) {
      saveLocalPhoto({
        genreTitle,
        photoName,
        photoSize,
        catchDate,
        comment,
        imageDataUrl: await blobToDataUrl(optimizedImageBlob),
      });

      uploadForm.reset();
      fileLabel.textContent = "画像を選択";
      await refreshState({ keepSelection: normalizeGenreId(genreTitle) });
      showView("ranking");
      setConnectionNotice("この端末内に一時保存しました。Supabase 設定後は共有保存に切り替わります。", "success");
      return;
    }

    setConnectionNotice("画像を Supabase に保存しています。", "info");
    const uploadPath = buildStoragePath(genreTitle, optimizedImageBlob.type || file.type);

    await uploadImage(uploadPath, optimizedImageBlob);
    await insertPhoto({
      genreTitle,
      photoName,
      photoSize,
      catchDate,
      comment,
      imagePath: uploadPath,
    });

    uploadForm.reset();
    fileLabel.textContent = "画像を選択";
    await refreshState({ keepSelection: normalizeGenreId(genreTitle) });
    showView("ranking");
    setConnectionNotice("Supabase に保存しました。別の端末でも同じデータを確認できます。", "success");
  } catch (error) {
    setConnectionNotice("Supabase への保存に失敗しました。設定や権限を確認してください。", "error");
    alert(getMessage(error, "画像を保存できませんでした。Supabase の設定や権限を確認してください。"));
  }
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!ensureCanMutate()) {
    return;
  }

  const record = findPhotoRecord(editingPhotoId);

  if (!record) {
    alert("編集対象のデータが見つかりませんでした。");
    showView("ranking");
    return;
  }

  const nextGenreTitle = editGenreTitleInput.value.trim();
  const nextPhotoName = editPhotoNameInput.value.trim();
  const nextPhotoSize = parseSize(editPhotoSizeInput.value);
  const nextCatchDate = editCatchDateInput.value || null;
  const nextComment = editPhotoCommentInput.value.trim();

  if (!nextGenreTitle || !nextPhotoName || !Number.isFinite(nextPhotoSize) || nextPhotoSize < 0) {
    alert("ジャンル、名前、サイズを入力してください。");
    return;
  }

  try {
    if (!supabaseClient) {
      updateLocalPhoto(record.photo.id, {
        genreTitle: nextGenreTitle,
        name: nextPhotoName,
        size: nextPhotoSize,
        catchDate: nextCatchDate,
        comment: nextComment,
      });

      await refreshState({ keepSelection: normalizeGenreId(nextGenreTitle) });
      showView("ranking");
      setConnectionNotice("この端末内のデータを更新しました。", "success");
      return;
    }

    await updatePhoto(record.photo.id, {
      genre_title: nextGenreTitle,
      name: nextPhotoName,
      size: nextPhotoSize,
      catch_date: nextCatchDate,
      comment: nextComment,
    });

    await refreshState({ keepSelection: normalizeGenreId(nextGenreTitle) });
    showView("ranking");
    setConnectionNotice("編集内容を Supabase に保存しました。", "success");
  } catch (error) {
    setConnectionNotice("編集内容を保存できませんでした。", "error");
    alert(getMessage(error, "編集内容を保存できませんでした。"));
  }
});

editDeleteButton.addEventListener("click", async () => {
  if (!ensureCanMutate()) {
    return;
  }

  const record = findPhotoRecord(editingPhotoId);

  if (!record) {
    alert("削除対象のデータが見つかりませんでした。");
    showView("ranking");
    return;
  }

  if (!confirm("このデータを削除しますか？")) {
    return;
  }

  try {
    if (!supabaseClient) {
      deleteLocalPhoto(record.photo.id);
      editingPhotoId = null;
      await refreshState({ keepSelection: selectedGenreId });
      showView(selectedGenreId ? "ranking" : "home");
      setConnectionNotice("この端末内のデータを削除しました。", "success");
      return;
    }

    await deletePhoto(record.photo);
    editingPhotoId = null;
    await refreshState({ keepSelection: selectedGenreId });
    showView(selectedGenreId ? "ranking" : "home");
    setConnectionNotice("Supabase からデータを削除しました。", "success");
  } catch (error) {
    setConnectionNotice("データを削除できませんでした。", "error");
    alert(getMessage(error, "データを削除できませんでした。"));
  }
});

window.addEventListener("focus", () => {
  void refreshState({ silent: true, keepSelection: selectedGenreId });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void refreshState({ silent: true, keepSelection: selectedGenreId });
  }
});

setInterval(() => {
  if (document.visibilityState === "visible") {
    void refreshState({ silent: true, keepSelection: selectedGenreId });
  }
}, REFRESH_INTERVAL_MS);

initializeApp();

async function initializeApp() {
  if (!supabaseClient) {
    state = loadLocalState();
    selectedGenreId = state.genres[0]?.id ?? null;
    renderApp();
    setConnectionNotice("Supabase 未設定のため、この端末内だけで動作テストできるモードです。", "info");
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    setConnectionNotice("ログイン状態を取得できませんでした。", "error");
  }

  currentUser = data?.session?.user ?? null;
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    renderAuth();
    updateUiAvailability();

    if (!currentUser && (currentView === "upload" || currentView === "edit")) {
      showView("home");
    }
  });

  setConnectionNotice("Supabase からデータを読み込んでいます。", "info");
  await refreshState({ silent: false });
  renderAuth();
}

async function refreshState(options = {}) {
  if (!supabaseClient) {
    state = loadLocalState();
    selectedGenreId = state.genres.some((genre) => genre.id === options.keepSelection)
      ? options.keepSelection
      : state.genres[0]?.id ?? null;

    if (!selectedGenreId && currentView === "ranking") {
      currentView = "home";
    }

    renderApp();
    return;
  }

  if (isRefreshing) {
    return;
  }

  const { silent = false, keepSelection = selectedGenreId } = options;
  isRefreshing = true;

  try {
    const rows = await fetchPhotos();
    const nextState = buildState(rows);
    const nextSignature = createStateSignature(nextState);

    if (keepSelection && nextState.genres.some((genre) => genre.id === keepSelection)) {
      selectedGenreId = keepSelection;
    } else {
      selectedGenreId = nextState.genres[0]?.id ?? null;
    }

    if (!selectedGenreId && currentView === "ranking") {
      currentView = "home";
    }

    if (nextSignature !== stateSignature) {
      state = nextState;
      stateSignature = nextSignature;
      renderApp();
    } else {
      syncViews();
    }

    if (!silent) {
      setConnectionNotice("Supabase と同期しました。", "success");
    }
  } catch (error) {
    if (!silent) {
      setConnectionNotice("Supabase からデータを取得できませんでした。", "error");
      alert(getMessage(error, "Supabase からデータを取得できませんでした。"));
    }
  } finally {
    isRefreshing = false;
  }
}

function renderApp() {
  renderHome();
  renderGenreOptions();
  renderGallery();
  renderAuth();
  syncViews();
  updateUiAvailability();
}

function renderAuth() {
  if (!supabaseClient) {
    authForm.classList.add("is-hidden");
    resetPasswordButton.hidden = true;
    signedInPanel.hidden = true;
    authMessage.textContent = "Supabase 設定後にログイン機能が使えます。";
    return;
  }

  const isSignedIn = Boolean(currentUser);
  authForm.classList.toggle("is-hidden", isSignedIn);
  resetPasswordButton.hidden = isSignedIn;
  signedInPanel.hidden = !isSignedIn;
  currentUserEmail.textContent = currentUser?.email ?? "";
  authMessage.textContent = isSignedIn
    ? "ログイン中です。どの端末からでも画像を投稿できます。"
    : "画像の投稿・編集にはログインが必要です。ランキングはログインなしで見られます。";
}

function renderHome() {
  const genresWithPhotos = state.genres.filter((genre) => genre.photos.length > 0);

  genreButtons.replaceChildren(
    ...genresWithPhotos.map((genre) => {
      const button = document.createElement("button");
      const title = document.createElement("span");
      const count = document.createElement("small");

      button.className = "genre-button";
      button.type = "button";
      title.textContent = genre.title;
      count.textContent = `${genre.photos.length}匹`;
      button.append(title, count);
      button.addEventListener("click", () => {
        selectedGenreId = genre.id;
        showView("ranking");
        renderGallery();
      });
      return button;
    }),
  );

  homeEmptyState.hidden = genresWithPhotos.length > 0;
}

function renderGenreOptions() {
  genreList.replaceChildren(
    ...state.genres.map((genre) => {
      const option = document.createElement("option");
      option.value = genre.title;
      return option;
    }),
  );
}

function renderGallery() {
  gallery.replaceChildren();

  const visibleGenres = state.genres
    .filter((genre) => genre.id === selectedGenreId)
    .map((genre) => ({
      ...genre,
      photos: [...genre.photos].sort((a, b) => b.size - a.size),
    }))
    .filter((genre) => genre.photos.length > 0);

  emptyState.classList.toggle("is-hidden", visibleGenres.length > 0);

  visibleGenres.forEach((genre) => {
    const genreCard = genreTemplate.content.firstElementChild.cloneNode(true);
    const title = genreCard.querySelector("h3");
    const count = genreCard.querySelector(".genre-count");
    const rankList = genreCard.querySelector(".rank-list");

    title.textContent = genre.title;
    count.textContent = `${genre.photos.length}匹`;

    genre.photos.forEach((photo, index) => {
      rankList.append(createPhotoCard(photo, index + 1));
    });

    gallery.append(genreCard);
  });
}

function syncViews() {
  homeView.classList.toggle("is-hidden", currentView !== "home");
  authView.classList.toggle("is-hidden", currentView === "ranking");
  uploadView.classList.toggle("is-hidden", currentView !== "upload");
  rankingView.classList.toggle("is-hidden", currentView !== "ranking");
  editView.classList.toggle("is-hidden", currentView !== "edit");
  connectionNotice.hidden = currentView === "ranking" || !connectionNotice.textContent;
}

function showView(viewName) {
  currentView = viewName;
  syncViews();
}

function updateUiAvailability() {
  const canMutate = !supabaseClient || Boolean(currentUser);

  showUploadButton.disabled = !canMutate;
  Array.from(uploadForm.elements).forEach((element) => {
    element.disabled = !canMutate;
  });

  editDeleteButton.disabled = !canMutate;
  Array.from(editForm.elements).forEach((element) => {
    element.disabled = !canMutate;
  });
}

function createPhotoCard(photo, rank) {
  const card = photoTemplate.content.firstElementChild.cloneNode(true);
  const image = card.querySelector("img");
  const rankBadge = card.querySelector(".rank-badge");
  const name = card.querySelector("h4");
  const date = card.querySelector(".photo-date");
  const likeButton = card.querySelector(".like-button");
  const likeIcon = card.querySelector(".like-icon");
  const likeCount = card.querySelector(".like-count");
  const size = card.querySelector(".photo-size");
  const comment = card.querySelector(".photo-comment");

  image.src = photo.imageUrl;
  image.alt = photo.name;
  rankBadge.textContent = `#${rank}`;
  rankBadge.classList.add(getRankBadgeClass(rank));
  name.textContent = photo.name;
  date.textContent = formatCatchDate(photo.catchDate);
  likeCount.textContent = formatLikeCount(photo.likeCount);
  likeIcon.textContent = photo.likedByClient ? "♥" : "♡";
  likeButton.classList.toggle("is-liked", photo.likedByClient);
  likeButton.disabled = photo.likedByClient;
  likeButton.addEventListener("click", () => {
    void likePhoto(photo.id);
  });
  size.textContent = formatSize(photo.size);
  comment.textContent = photo.comment || "コメントなし";

  rankBadge.classList.add("rank-badge-secret");
  rankBadge.addEventListener("click", () => {
    handleSecretTap(photo.id);
  });

  return card;
}

function getRankBadgeClass(rank) {
  if (rank === 1) {
    return "rank-badge-gold";
  }

  if (rank === 2) {
    return "rank-badge-silver";
  }

  if (rank === 3) {
    return "rank-badge-bronze";
  }

  return "rank-badge-standard";
}

async function likePhoto(photoId) {
  const record = findPhotoRecord(photoId);

  if (!record || record.photo.likedByClient) {
    return;
  }

  record.photo.likedByClient = true;
  record.photo.likeCount += 1;
  renderGallery();

  try {
    if (!supabaseClient) {
      likeLocalPhoto(photoId);
      stateSignature = createStateSignature(state);
      return;
    }

    const { error } = await supabaseClient.from(SUPABASE_LIKES_TABLE).insert({
      photo_id: photoId,
      client_id: clientId,
    });

    if (error && error.code !== "23505") {
      throw error;
    }

    await refreshState({ silent: true, keepSelection: selectedGenreId });
  } catch (error) {
    record.photo.likedByClient = false;
    record.photo.likeCount = Math.max(0, record.photo.likeCount - 1);
    renderGallery();
    alert(getMessage(error, "いいねできませんでした。Supabase の photo_likes テーブル設定を確認してください。"));
  }
}

function openImageViewer(imageUrl, imageAlt) {
  imageViewerImage.src = imageUrl;
  imageViewerImage.alt = imageAlt || "表示中の画像";
  viewerTransform = {
    scale: 1,
    translateX: 0,
    translateY: 0,
  };
  applyViewerTransform();
  imageViewer.hidden = false;
  document.body.classList.add("is-viewer-open");
}

function closeImageViewer() {
  imageViewer.hidden = true;
  imageViewerImage.removeAttribute("src");
  document.body.classList.remove("is-viewer-open");
  viewerGesture.mode = null;
}

function handleViewerTouchStart(event) {
  if (imageViewer.hidden) {
    return;
  }

  if (imageViewerClose.contains(event.target)) {
    return;
  }

  if (event.touches.length === 1) {
    event.preventDefault();
    const touch = event.touches[0];
    viewerGesture = {
      mode: "pan",
      startDistance: 0,
      startScale: viewerTransform.scale,
      startX: touch.clientX,
      startY: touch.clientY,
      startTranslateX: viewerTransform.translateX,
      startTranslateY: viewerTransform.translateY,
    };
    return;
  }

  if (event.touches.length === 2) {
    event.preventDefault();
    viewerGesture = {
      mode: "pinch",
      startDistance: getTouchDistance(event.touches),
      startScale: viewerTransform.scale,
      startX: 0,
      startY: 0,
      startTranslateX: viewerTransform.translateX,
      startTranslateY: viewerTransform.translateY,
    };
  }
}

function handleViewerTouchMove(event) {
  if (imageViewer.hidden || !viewerGesture.mode) {
    return;
  }

  if (viewerGesture.mode === "pinch" && event.touches.length === 2) {
    event.preventDefault();
    const nextScale = viewerGesture.startScale * (getTouchDistance(event.touches) / viewerGesture.startDistance);
    viewerTransform.scale = clamp(nextScale, 1, 5);
    applyViewerTransform();
    return;
  }

  if (viewerGesture.mode === "pan" && event.touches.length === 1 && viewerTransform.scale > 1) {
    event.preventDefault();
    const touch = event.touches[0];
    viewerTransform.translateX = viewerGesture.startTranslateX + touch.clientX - viewerGesture.startX;
    viewerTransform.translateY = viewerGesture.startTranslateY + touch.clientY - viewerGesture.startY;
    applyViewerTransform();
  }
}

function handleViewerTouchEnd(event) {
  if (event.touches.length === 0) {
    viewerGesture.mode = null;
  }
}

function applyViewerTransform() {
  imageViewerImage.style.transform = `translate(${viewerTransform.translateX}px, ${viewerTransform.translateY}px) scale(${viewerTransform.scale})`;
}

function getTouchDistance(touches) {
  const first = touches[0];
  const second = touches[1];
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function handleSecretTap(photoId) {
  if (secretTapState.timerId) {
    clearTimeout(secretTapState.timerId);
  }

  if (secretTapState.photoId !== photoId) {
    secretTapState.photoId = photoId;
    secretTapState.count = 0;
  }

  secretTapState.count += 1;
  secretTapState.timerId = setTimeout(resetSecretTapState, SECRET_TAP_RESET_MS);

  if (secretTapState.count >= SECRET_TAP_COUNT) {
    resetSecretTapState();
    openEditView(photoId);
  }
}

function resetSecretTapState() {
  if (secretTapState.timerId) {
    clearTimeout(secretTapState.timerId);
  }

  secretTapState = {
    photoId: null,
    count: 0,
    timerId: null,
  };
}

function openEditView(photoId) {
  const record = findPhotoRecord(photoId);

  if (!record) {
    alert("編集対象のデータが見つかりませんでした。");
    return;
  }

  editingPhotoId = record.photo.id;
  editGenreTitleInput.value = record.genre.title;
  editPhotoNameInput.value = record.photo.name;
  editPhotoSizeInput.value = String(record.photo.size);
  editCatchDateInput.value = record.photo.catchDate ?? "";
  editPhotoCommentInput.value = record.photo.comment ?? "";
  editPreviewImage.src = record.photo.imageUrl;
  editPreviewImage.alt = record.photo.name;
  editDate.textContent = formatCatchDate(record.photo.catchDate);
  showView("edit");
}

function findPhotoRecord(photoId) {
  for (const genre of state.genres) {
    const photo = genre.photos.find((item) => item.id === photoId);

    if (photo) {
      return { genre, photo };
    }
  }

  return null;
}

function buildState(rows) {
  const genres = new Map();

  rows.forEach((row) => {
    const title = (row.genre_title || "未分類").trim() || "未分類";
    const genreId = normalizeGenreId(title);
    const genre = genres.get(genreId) ?? {
      id: genreId,
      title,
      photos: [],
    };

    genre.photos.push({
      id: row.id,
      name: row.name ?? "名前なし",
      size: Number(row.size) || 0,
      comment: row.comment ?? "",
      imagePath: row.image_path,
      imageUrl: row.image_url ?? getPublicImageUrl(row.image_path),
      userId: row.user_id ?? null,
      catchDate: row.catch_date ?? null,
      likeCount: Number(row.like_count) || 0,
      likedByClient: Boolean(row.liked_by_client),
      createdAt: row.created_at ?? new Date().toISOString(),
    });

    genres.set(genreId, genre);
  });

  return {
    genres: Array.from(genres.values()).sort((a, b) => a.title.localeCompare(b.title, "ja-JP")),
  };
}

function createStateSignature(nextState) {
  return JSON.stringify(
    nextState.genres.map((genre) => ({
      id: genre.id,
      title: genre.title,
      photos: genre.photos.map((photo) => ({
        id: photo.id,
        name: photo.name,
        size: photo.size,
        comment: photo.comment,
        imagePath: photo.imagePath,
        imageUrl: photo.imageUrl,
        catchDate: photo.catchDate,
        likeCount: photo.likeCount,
        likedByClient: photo.likedByClient,
        createdAt: photo.createdAt,
      })),
    })),
  );
}

async function fetchPhotos() {
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select("id, genre_title, name, size, comment, image_path, user_id, catch_date, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const photos = data ?? [];
  const photoIds = photos.map((photo) => photo.id);

  if (photoIds.length === 0) {
    return photos;
  }

  const { data: likes, error: likesError } = await supabaseClient
    .from(SUPABASE_LIKES_TABLE)
    .select("photo_id, client_id")
    .in("photo_id", photoIds);

  if (likesError) {
    return photos;
  }

  const likeCounts = new Map();
  const likedPhotoIds = new Set();

  (likes ?? []).forEach((like) => {
    likeCounts.set(like.photo_id, (likeCounts.get(like.photo_id) ?? 0) + 1);

    if (like.client_id === clientId) {
      likedPhotoIds.add(like.photo_id);
    }
  });

  return photos.map((photo) => ({
    ...photo,
    like_count: likeCounts.get(photo.id) ?? 0,
    liked_by_client: likedPhotoIds.has(photo.id),
  }));
}

async function insertPhoto({ genreTitle, photoName, photoSize, catchDate, comment, imagePath }) {
  const { error } = await supabaseClient.from(SUPABASE_TABLE).insert({
    genre_title: genreTitle,
    name: photoName,
    size: photoSize,
    catch_date: catchDate,
    comment,
    image_path: imagePath,
    user_id: currentUser?.id ?? null,
  });

  if (error) {
    await removeImage(imagePath).catch(() => undefined);
    throw error;
  }
}

async function updatePhoto(photoId, values) {
  const { error } = await supabaseClient.from(SUPABASE_TABLE).update(values).eq("id", photoId);

  if (error) {
    throw error;
  }
}

async function deletePhoto(photo) {
  await removeImage(photo.imagePath);

  const { error } = await supabaseClient.from(SUPABASE_TABLE).delete().eq("id", photo.id);

  if (error) {
    throw error;
  }
}

async function uploadImage(path, file) {
  const { error } = await supabaseClient.storage.from(SUPABASE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "image/jpeg",
    upsert: false,
  });

  if (error) {
    throw error;
  }
}

async function removeImage(path) {
  const { error } = await supabaseClient.storage.from(SUPABASE_BUCKET).remove([path]);

  if (error) {
    throw error;
  }
}

function getPublicImageUrl(path) {
  if (!path) {
    return "";
  }

  const { data } = supabaseClient.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function buildStoragePath(genreTitle, mimeType) {
  const safeGenre = sanitizePathSegment(genreTitle || "misc");
  const extension = mimeTypeToExtension(mimeType);
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${safeGenre}/${randomId}.${extension}`;
}

function sanitizePathSegment(value) {
  const source = value.trim();
  const normalized = source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || `genre-${hashText(source || "misc")}`;
}

function hashText(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function mimeTypeToExtension(mimeType) {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "jpg";
}

function normalizeGenreId(title) {
  return title.trim().toLocaleLowerCase("ja-JP");
}

async function signIn() {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (!email || !password) {
    alert("メールアドレスとパスワードを入力してください。");
    return;
  }

  setAuthBusy(true);

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      throw error;
    }

    authPasswordInput.value = "";
    setConnectionNotice("ログインしました。画像を投稿できます。", "success");
  } catch (error) {
    setConnectionNotice("ログインに失敗しました。", "error");
    alert(getMessage(error, "ログインに失敗しました。メールアドレスとパスワードを確認してください。"));
  } finally {
    setAuthBusy(false);
  }
}

async function signUp() {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (!email || password.length < 6) {
    alert("メールアドレスと6文字以上のパスワードを入力してください。");
    return;
  }

  setAuthBusy(true);

  try {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });

    if (error) {
      throw error;
    }

    authPasswordInput.value = "";
    const needsConfirmation = !data.session;
    setConnectionNotice(
      needsConfirmation
        ? "登録しました。確認メールが届いている場合は、メール内のリンクを開いてからログインしてください。"
        : "登録してログインしました。画像を投稿できます。",
      "success",
    );
  } catch (error) {
    setConnectionNotice("新規登録に失敗しました。", "error");
    alert(getMessage(error, "新規登録に失敗しました。"));
  } finally {
    setAuthBusy(false);
  }
}

async function requestPasswordReset() {
  const email = authEmailInput.value.trim();

  if (!email) {
    alert("再設定メールを送るメールアドレスを入力してください。");
    return;
  }

  setAuthBusy(true);

  try {
    const options = getPasswordResetRedirectOptions();
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, options);

    if (error) {
      throw error;
    }

    setConnectionNotice("パスワード再設定メールを送信しました。メール内のリンクを開いてください。", "success");
    alert("パスワード再設定メールを送信しました。メール内のリンクを開いてください。");
  } catch (error) {
    setConnectionNotice("パスワード再設定メールを送信できませんでした。", "error");
    alert(getMessage(error, "パスワード再設定メールを送信できませんでした。"));
  } finally {
    setAuthBusy(false);
  }
}

function getPasswordResetRedirectOptions() {
  if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
    return undefined;
  }

  return {
    redirectTo: `${window.location.origin}${window.location.pathname}`,
  };
}

function setAuthBusy(isBusy) {
  Array.from(authForm.elements).forEach((element) => {
    element.disabled = isBusy;
  });
}

function ensureSupabaseConfigured() {
  if (!supabaseClient) {
    alert("ログインには Supabase URL と anon key の設定が必要です。");
    setConnectionNotice("supabase-config.js に Supabase の URL と anon key を設定してください。", "error");
    return false;
  }

  return true;
}

function ensureCanMutate() {
  if (!supabaseClient) {
    return true;
  }

  if (!currentUser) {
    alert("画像の投稿・編集にはログインしてください。");
    setConnectionNotice("ログインすると、どの端末からでも画像を投稿できます。", "info");
    return false;
  }

  return true;
}

function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase?.createClient) {
    return null;
  }

  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function setConnectionNotice(message, tone) {
  if (currentView === "ranking") {
    connectionNotice.hidden = true;
    return;
  }

  connectionNotice.textContent = message;
  connectionNotice.dataset.tone = tone;
  connectionNotice.hidden = false;
}

function getMessage(error, fallback) {
  return error?.message ? `${fallback}\n${error.message}` : fallback;
}

function loadLocalState() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY));

    if (!Array.isArray(raw)) {
      return { genres: [] };
    }

    return buildState(raw);
  } catch {
    return { genres: [] };
  }
}

function saveLocalPhoto({ genreTitle, photoName, photoSize, catchDate, comment, imageDataUrl }) {
  const items = readLocalItems();

  items.unshift({
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    genre_title: genreTitle,
    name: photoName,
    size: photoSize,
    catch_date: catchDate,
    comment,
    image_path: "",
    image_url: imageDataUrl,
    like_count: 0,
    liked_by_client: false,
    created_at: new Date().toISOString(),
  });

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
}

function updateLocalPhoto(photoId, values) {
  const items = readLocalItems().map((item) =>
    item.id === photoId
      ? {
          ...item,
          genre_title: values.genreTitle,
          name: values.name,
          size: values.size,
          catch_date: values.catchDate,
          comment: values.comment,
        }
      : item,
  );

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
}

function deleteLocalPhoto(photoId) {
  const items = readLocalItems().filter((item) => item.id !== photoId);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
}

function likeLocalPhoto(photoId) {
  const items = readLocalItems().map((item) =>
    item.id === photoId
      ? {
          ...item,
          like_count: Number(item.like_count) + 1 || 1,
          liked_by_client: true,
        }
      : item,
  );

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
}

function readLocalItems() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function getLocalClientId() {
  const existingClientId = localStorage.getItem(LOCAL_CLIENT_ID_KEY);

  if (existingClientId) {
    return existingClientId;
  }

  const nextClientId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(LOCAL_CLIENT_ID_KEY, nextClientId);
  return nextClientId;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(blob);
  });
}

async function optimizeImageFile(file) {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const imageSource = await loadImageSource(file);
  const imageSize = getImageSourceSize(imageSource);
  const { width, height } = fitWithinBounds(imageSize.width, imageSize.height);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;

  if (!context) {
    closeImageSource(imageSource);
    return file;
  }

  context.drawImage(imageSource, 0, 0, width, height);
  closeImageSource(imageSource);

  const outputType = "image/jpeg";

  for (const quality of JPEG_QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, outputType, quality);

    if (blob && blob.size <= MAX_IMAGE_BYTES) {
      return blob;
    }
  }

  const fallbackBlob = await canvasToBlob(canvas, outputType, JPEG_QUALITY_STEPS[JPEG_QUALITY_STEPS.length - 1]);

  if (!fallbackBlob) {
    throw new Error("画像をJPEG形式に変換できませんでした。iPhoneの写真設定を「互換性優先」にして再度お試しください。");
  }

  return fallbackBlob;
}

async function loadImageSource(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Some mobile browsers reject camera images here. Fall back to an HTML image.
    }
  }

  return loadHtmlImage(file);
}

function loadHtmlImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.addEventListener("load", () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像を読み込めませんでした。別の画像を選択してください。"));
    });
    image.src = objectUrl;
  });
}

function closeImageSource(imageSource) {
  if (typeof imageSource.close === "function") {
    imageSource.close();
  }
}

function getImageSourceSize(imageSource) {
  return {
    width: imageSource.width || imageSource.naturalWidth,
    height: imageSource.height || imageSource.naturalHeight,
  };
}

function fitWithinBounds(width, height) {
  const scale = Math.min(MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height, 1);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function formatCatchDate(value) {
  if (!value) {
    return "釣果日不明";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00`));
}

function parseSize(value) {
  return Number(value.trim().replace(",", "."));
}

function formatSize(value) {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatLikeCount(value) {
  return new Intl.NumberFormat("ja-JP").format(value);
}
