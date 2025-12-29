import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getDatabase, ref, push, set, onValue, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAfpZ1V0xoujpQvklr_HTPjB1i5WaKc8ug",
  authDomain: "fazaproducts.firebaseapp.com",
  databaseURL:
    "https://fazaproducts-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "fazaproducts",
  storageBucket: "fazaproducts.firebasestorage.app",
  messagingSenderId: "851115755354",
  appId: "1:851115755354:web:5b8894f8e5aaa3f43d1563",
  measurementId: "G-W1L31FE6T9",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize Database
const database = getDatabase(app);
const stars = document.querySelectorAll(".star");
const ratingInput = document.getElementById("rating");
const ratingText = document.getElementById("ratingText");
const commentTextarea = document.getElementById("comment");
const charCount = document.getElementById("charCount");
const reviewForm = document.getElementById("reviewForm");
const successMessage = document.getElementById("successMessage");
const failMessage = document.getElementById("failMessage");
let selectedRating = 0;

/* ================================
    SAVE REVIEW
================================= */
function saveReview(reviewData) {
  const reviewsRef = ref(database, "reviews");
  const newReviewRef = push(reviewsRef);

  return set(newReviewRef, {
    productId: String(reviewData.productId),
    name: reviewData.name,
    rating: reviewData.rating,
    comment: reviewData.comment,
    createdAt: Date.now(),
  })
    .then(() => {
      return true;
    })
    .catch((error) => {
      console.error("Error saving review:", error);
      return false;
    });
}

/* ================================
    RETRIEVE REVIEWS
================================= */
export function getReviews(productId) {
  return new Promise((resolve, reject) => {
    const reviewsRef = ref(database, "reviews");

    const reviewsQuery = query(
      reviewsRef,
      orderByChild("productId"),
      equalTo(String(productId))
    );

    onValue(
      reviewsQuery,
      (snapshot) => {
        const data = snapshot.val();
        const reviewsList = [];

        if (data) {
          Object.values(data).forEach((review) => {
            reviewsList.push({
              name: review.name,
              rating: review.rating,
              date: review.createdAt
                ? new Date(review.createdAt).toISOString().split("T")[0]
                : review.date || "",
              text: review.comment || review.text || "",
            });
          });
        }

        resolve(reviewsList);
      },
      {
        onlyOnce: true,
      }
    );
  });
}

function updateStars(rating, isHover = false) {
  stars.forEach((star, index) => {
    star.classList.remove("active", "hover");
    if (index < rating) {
      star.classList.add(isHover && !selectedRating ? "hover" : "active");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const ratingLabels = {
    1: "Poor - Not satisfied",
    2: "Fair - Below expectations",
    3: "Good - Meets expectations",
    4: "Very Good - Exceeds expectations",
    5: "Excellent - Outstanding!",
  };

  stars.forEach((star) => {
    star.addEventListener("click", function () {
      selectedRating = parseInt(this.dataset.rating);
      ratingInput.value = selectedRating;
      updateStars(selectedRating);
      ratingText.textContent = ratingLabels[selectedRating];
    });

    star.addEventListener("mouseenter", function () {
      const hoverRating = parseInt(this.dataset.rating);
      updateStars(hoverRating, true);
    });
  });

  document
    .getElementById("starRating")
    .addEventListener("mouseleave", function () {
      updateStars(selectedRating);
    });

  commentTextarea.addEventListener("input", function () {
    charCount.textContent = this.value.length;
  });

  reviewForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    if (!ratingInput.value) {
      alert("Please select a rating");
      return;
    }

    const reviewData = {
      productId: document.getElementById("addToCart").dataset.id,
      name: document.getElementById("name").value,
      rating: ratingInput.value,
      comment: commentTextarea.value,
    };

    const result = await saveReview(reviewData);

    if (result) {
      successMessage.classList.add("show");
      successMessage.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    } else {
      failMessage.classList.add("show");
      failMessage.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }

    reviewForm.reset();
    selectedRating = 0;
    updateStars(0);
    ratingText.textContent = "Select your rating";
    charCount.textContent = "0";
  });
});
