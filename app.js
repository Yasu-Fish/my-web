const STORAGE_KEY = "photoshare.items";

const homeView = document.querySelector("#homeView");
const rankingView = document.querySelector("#rankingView");
const uploadView = document.querySelector("#uploadView");
const genreButtons = document.querySelector("#genreButtons");
const homeEmptyState = document.querySelector("#homeEmptyState");
const showUploadButton = document.querySelector("#showUploadButton");
const uploadForm = document.querySelector("#uploadForm");
const genreTitleInput = document.querySelector("#genreTitle");
const genreList = document.querySelector("#genreList");
const photoNameInput = document.querySelector("#photoName");
const photoSizeInput = document.querySelector("#photoSize");
const photoCommentInput = document.querySelector("#photoComment");
const photoInput = document.querySelector("#photoInput");
const fileLabel = document.querySelector("#fileLabel");
const gallery = document.querySelector("#gallery");
const emptyState = document.querySelector("#emptyState");
const clearButton = document.querySelector("#clearButton");
const genreTemplate = document.querySelector("#genreTemplate");
const photoTemplate = document.querySelector("#photoCardTemplate");

let state = loadState();
let selectedGenreId = null;
let currentView = "home";

renderApp();

showUploadButton.addEventListener("click", () => {
  showView("upload");
});

document.querySelectorAll(".back-button").forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.view);
  });
});

photoInput.addEventListener("change", () => {
  const file = photoInput.files?.[0];
  fileLabel.textContent = file ? file.name : "画像を選択";
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = photoInput.files?.[0];
  const genreTitle = genreTitleInput.value.trim();
  const photoName = photoNameInput.value.trim();
  const photoSize = parseSize(photoSizeInput.value);
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
    const imageData = await readAsDataUrl(file);
    const genre = findOrCreateGenre(genreTitle);

    genre.photos.push({
      id: createId(),
      name: photoName,
      size: photoSize,
      comment,
      imageData,
      createdAt: new Date().toISOString(),
    });

    saveState();
    selectedGenreId = genre.id;
    uploadForm.reset();
    fileLabel.textContent = "画像を選択";
    showView("ranking");
    renderApp();
  } catch {
    alert("画像を読み込めませんでした。別の画像で試してください。");
  }
});

clearButton.addEventListener("click", () => {
  if (!hasPhotos()) {
    return;
  }

  if (confirm("登録したジャンル、画像、コメントをすべて削除しますか？")) {
    state = { genres: [] };
    selectedGenreId = null;
    currentView = "home";
    saveState();
    renderApp();
  }
});

function renderApp() {
  renderHome();
  renderGenreOptions();
  renderGallery();
  syncViews();
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
      count.textContent = `${genre.photos.length}件`;
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
  clearButton.hidden = visibleGenres.length === 0;

  visibleGenres.forEach((genre) => {
    const genreCard = genreTemplate.content.firstElementChild.cloneNode(true);
    const title = genreCard.querySelector("h3");
    const count = genreCard.querySelector(".genre-count");
    const rankList = genreCard.querySelector(".rank-list");

    title.textContent = genre.title;
    count.textContent = `${genre.photos.length}件`;

    genre.photos.forEach((photo, index) => {
      rankList.append(createPhotoCard(genre.id, photo, index + 1));
    });

    gallery.append(genreCard);
  });
}

function showView(viewName) {
  currentView = viewName;
  syncViews();
}

function syncViews() {
  homeView.classList.toggle("is-hidden", currentView !== "home");
  uploadView.classList.toggle("is-hidden", currentView !== "upload");
  rankingView.classList.toggle("is-hidden", currentView !== "ranking");
}

function createPhotoCard(genreId, photo, rank) {
  const card = photoTemplate.content.firstElementChild.cloneNode(true);
  const image = card.querySelector("img");
  const rankBadge = card.querySelector(".rank-badge");
  const name = card.querySelector("h4");
  const date = card.querySelector(".photo-date");
  const size = card.querySelector(".photo-size");
  const comment = card.querySelector(".photo-comment");
  const deleteButton = card.querySelector(".delete-button");

  image.src = photo.imageData;
  image.alt = photo.name;
  rankBadge.textContent = `#${rank}`;
  name.textContent = photo.name;
  date.textContent = formatDate(photo.createdAt);
  size.textContent = formatSize(photo.size);
  comment.textContent = photo.comment || "コメントなし";

  deleteButton.addEventListener("click", () => {
    deletePhoto(genreId, photo.id);
  });

  return card;
}

function findOrCreateGenre(title) {
  const normalizedTitle = title.toLocaleLowerCase("ja-JP");
  let genre = state.genres.find((item) => item.title.toLocaleLowerCase("ja-JP") === normalizedTitle);

  if (!genre) {
    genre = {
      id: createId(),
      title,
      photos: [],
    };
    state.genres.push(genre);
  }

  return genre;
}

function deletePhoto(genreId, photoId) {
  state.genres = state.genres
    .map((genre) => {
      if (genre.id !== genreId) {
        return genre;
      }

      return {
        ...genre,
        photos: genre.photos.filter((photo) => photo.id !== photoId),
      };
    })
    .filter((genre) => genre.photos.length > 0);

  saveState();
  if (!state.genres.some((genre) => genre.id === selectedGenreId)) {
    selectedGenreId = null;
    currentView = "home";
  }
  renderApp();
}

function hasPhotos() {
  return state.genres.some((genre) => genre.photos.length > 0);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function loadState() {
  try {
    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (Array.isArray(savedData)) {
      return migratePhotoList(savedData);
    }

    if (savedData?.genres) {
      return {
        genres: savedData.genres.map((genre) => ({
          ...genre,
          photos: Array.isArray(genre.photos) ? genre.photos : [],
        })),
      };
    }
  } catch {
    return { genres: [] };
  }

  return { genres: [] };
}

function migratePhotoList(photos) {
  if (photos.length === 0) {
    return { genres: [] };
  }

  return {
    genres: [
      {
        id: createId(),
        title: "未分類",
        photos: photos.map((photo, index) => ({
          id: photo.id ?? createId(),
          name: photo.name ?? `画像 ${index + 1}`,
          size: Number(photo.size) || 0,
          comment: photo.comment ?? "",
          imageData: photo.imageData,
          createdAt: photo.createdAt ?? new Date().toISOString(),
        })),
      },
    ],
  };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    alert("保存容量が足りない可能性があります。画像を減らすか、小さい画像で試してください。");
  }
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function parseSize(value) {
  return Number(value.trim().replace(",", "."));
}

function formatSize(value) {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 2,
  }).format(value);
}
