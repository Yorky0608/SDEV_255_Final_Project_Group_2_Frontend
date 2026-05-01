function resolveApiBaseUrl() {
  const configuredBaseUrl = typeof window !== "undefined"
    ? window.COURSE_MANAGER_API_BASE_URL
    : "";

  if (typeof configuredBaseUrl === "string" && configuredBaseUrl.trim()) {
    return configuredBaseUrl.trim().replace(/\/$/, "");
  }

  const hostname = typeof window !== "undefined" ? window.location.hostname : "";

  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:5000";
  }

  return null;
}

const API_BASE_URL = resolveApiBaseUrl();
const AUTH_STORAGE_KEY = "courseManagerAuth";

function getApiUrl(path) {
  if (!API_BASE_URL) {
    throw new Error(
      "Backend URL is not configured. Set window.COURSE_MANAGER_API_BASE_URL in config.js to your deployed backend URL."
    );
  }

  return `${API_BASE_URL}${path}`;
}

function renderMessageRow(message, colspan = 6) {
  return `<tr><td colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getStoredAuth() {
  try {
    const rawValue = window.localStorage.getItem(AUTH_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);

    if (!parsedValue || typeof parsedValue !== "object" || typeof parsedValue.token !== "string") {
      return null;
    }

    return parsedValue;
  } catch {
    return null;
  }
}

function setStoredAuth(authState) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
}

function clearStoredAuth() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function getAuthToken() {
  return getStoredAuth()?.token || "";
}

function normalizeAuthenticatedUser(payload) {
  const user = payload && typeof payload === "object" && payload.user
    ? payload.user
    : payload;

  if (!user || typeof user !== "object") {
    throw new Error("Unexpected authentication response from the backend.");
  }

  return user;
}

function buildRequestHeaders({ headers = {}, body, auth = false } = {}) {
  const resolvedHeaders = new Headers(headers);

  if (body && !(body instanceof FormData) && !resolvedHeaders.has("Content-Type")) {
    resolvedHeaders.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getAuthToken();

    if (!token) {
      throw new Error("You need to sign in first.");
    }

    resolvedHeaders.set("Authorization", `Bearer ${token}`);
  }

  return Object.fromEntries(resolvedHeaders.entries());
}

async function sendJsonRequest(url, options = {}) {
  const { auth = false, headers = {}, body, ...fetchOptions } = options;
  const response = await fetch(url, {
    ...fetchOptions,
    body,
    headers: buildRequestHeaders({ headers, body, auth })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (auth && (response.status === 401 || response.status === 403)) {
      clearStoredAuth();
    }

    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

async function loginUser(username, password) {
  const response = await sendJsonRequest(getApiUrl("/auth/login"), {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  const user = normalizeAuthenticatedUser(response);
  const authState = {
    token: response.token,
    user
  };

  if (!authState.token) {
    throw new Error("Login did not return a bearer token.");
  }

  setStoredAuth(authState);
  return authState;
}

async function fetchCurrentUser() {
  const response = await sendJsonRequest(getApiUrl("/auth/me"), {
    method: "GET",
    auth: true
  });
  const user = normalizeAuthenticatedUser(response);
  const authState = getStoredAuth();

  if (authState?.token) {
    setStoredAuth({
      token: authState.token,
      user
    });
  }

  return user;
}

async function fetchCourses() {
  return sendJsonRequest(getApiUrl("/courses"), {
    method: "GET",
    auth: true
  });
}

function setStatus(element, message, type = "info") {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.dataset.state = message ? type : "";
}

function showElement(element, visible) {
  if (!element) {
    return;
  }

  element.hidden = !visible;
}

function getEnrolledCount(course) {
  if (Number.isInteger(course.enrolledCount)) {
    return course.enrolledCount;
  }

  if (Array.isArray(course.students)) {
    return course.students.length;
  }

  return 0;
}

function getAvailableSeats(course) {
  if (Number.isInteger(course.availableSeats)) {
    return course.availableSeats;
  }

  const capacity = Number(course.capacity) || 0;
  return Math.max(capacity - getEnrolledCount(course), 0);
}

function formatStudentRoster(students) {
  if (!Array.isArray(students) || students.length === 0) {
    return "<span class=\"muted-text\">No students enrolled</span>";
  }

  const items = students.map(student => {
    if (typeof student === "string") {
      return `<li>${escapeHtml(student)}</li>`;
    }

    const label = student.name || student.username || student.id || "Student";
    const detail = student.username && student.username !== label
      ? ` <span class=\"muted-text\">(${escapeHtml(student.username)})</span>`
      : "";

    return `<li>${escapeHtml(label)}${detail}</li>`;
  }).join("");

  return `<ul class=\"roster-list\">${items}</ul>`;
}

function createCourseRow(course, role = "guest") {
  const enrolledCount = getEnrolledCount(course);
  const availableSeats = getAvailableSeats(course);
  const statusBadge = role === "student" && course.enrolled
    ? '<span class="badge badge-success">Enrolled</span>'
    : `<span class="badge">${enrolledCount} / ${escapeHtml(course.capacity)}</span>`;
  const seatSummary = role === "student"
    ? `${statusBadge}<div class="table-meta">${availableSeats} seats left</div>`
    : `${statusBadge}<div class="table-meta">${availableSeats} seats open</div>`;

  return `
    <tr>
      <td><strong>${escapeHtml(course.code)}</strong></td>
      <td>${escapeHtml(course.title)}</td>
      <td>${escapeHtml(course.credits)}</td>
      <td>${escapeHtml(course.instructor)}</td>
      <td>${escapeHtml(course.schedule)}</td>
      <td>${seatSummary}</td>
    </tr>
  `;
}

function createCourseOption(course) {
  return `<option value="${escapeHtml(course.code)}">${escapeHtml(course.code)} - ${escapeHtml(course.title)}</option>`;
}

function createStudentScheduleRow(course) {
  return `
    <tr>
      <td><strong>${escapeHtml(course.code)}</strong></td>
      <td>${escapeHtml(course.title)}</td>
      <td>${escapeHtml(course.schedule)}</td>
      <td><span class="badge badge-success">Enrolled</span></td>
    </tr>
  `;
}

function fillAuthSummary(container, user, roleLabel) {
  if (!container || !user) {
    return;
  }

  container.innerHTML = `
    <div>
      <strong>${escapeHtml(user.name || user.username)}</strong>
      <div class="auth-summary-meta">
        ${escapeHtml(user.username)}
        <span class="auth-summary-dot">•</span>
        ${escapeHtml(roleLabel || user.role)}
      </div>
    </div>
  `;
}

async function initializeCoursesPage() {
  const coursesTableBody = document.getElementById("courses-table-body");

  if (!coursesTableBody) {
    return;
  }

  const statusElement = document.getElementById("courses-status");
  const authPanel = document.getElementById("courses-auth-panel");
  const auth = getStoredAuth();

  if (!auth?.token) {
    coursesTableBody.innerHTML = renderMessageRow("Sign in through the student or teacher portal to view courses.");
    showElement(authPanel, true);
    setStatus(statusElement, "This page now uses the authenticated course API.", "info");
    return;
  }

  try {
    const user = await fetchCurrentUser();
    const courses = await fetchCourses();

    if (!Array.isArray(courses) || courses.length === 0) {
      coursesTableBody.innerHTML = renderMessageRow("No courses available.");
      setStatus(statusElement, `Signed in as ${user.name || user.username} (${user.role}).`, "info");
      return;
    }

    coursesTableBody.innerHTML = courses.map(course => createCourseRow(course, user.role)).join("");
    showElement(authPanel, false);
    setStatus(statusElement, `Signed in as ${user.name || user.username} (${user.role}).`, "info");
  } catch (error) {
    console.error("Error fetching courses:", error);
    coursesTableBody.innerHTML = renderMessageRow(error.message);
    showElement(authPanel, true);
    setStatus(statusElement, error.message, "error");
  }
}

async function initializeStudentPage() {
  const loginForm = document.getElementById("student-login-form");
  const enrollForm = document.getElementById("enroll-form");
  const dropForm = document.getElementById("drop-form");

  if (!loginForm || !enrollForm || !dropForm) {
    return;
  }

  const loginPanel = document.getElementById("student-login-panel");
  const authSummary = document.getElementById("student-auth-summary");
  const authSummaryContent = document.getElementById("student-auth-summary-content");
  const logoutButton = document.getElementById("student-logout-button");
  const roleMessage = document.getElementById("student-role-message");
  const roleMessageText = document.getElementById("student-role-message-text");
  const studentContent = document.getElementById("student-portal-content");
  const usernameInput = document.getElementById("student-username");
  const passwordInput = document.getElementById("student-password");
  const courseToAddSelect = document.getElementById("courseToAdd");
  const courseToDropSelect = document.getElementById("courseToDrop");
  const scheduleBody = document.getElementById("student-schedule-body");
  const statusElement = document.getElementById("student-status");

  async function refreshStudentView(user) {
    const courses = await fetchCourses();
    const enrolledCourses = courses.filter(course => course.enrolled);
    const availableCourses = courses.filter(course => !course.enrolled);

    courseToAddSelect.innerHTML = `<option value="">Select a course...</option>${availableCourses.map(createCourseOption).join("")}`;
    courseToDropSelect.innerHTML = `<option value="">Select an enrolled course...</option>${enrolledCourses.map(createCourseOption).join("")}`;

    if (enrolledCourses.length === 0) {
      scheduleBody.innerHTML = '<tr><td colspan="4">You are not enrolled in any courses yet.</td></tr>';
    } else {
      scheduleBody.innerHTML = enrolledCourses.map(createStudentScheduleRow).join("");
    }

    fillAuthSummary(authSummaryContent, user, "student account");
    setStatus(statusElement, `Signed in as ${user.name || user.username}.`, "info");
  }

  async function applyStudentSession() {
    const auth = getStoredAuth();

    if (!auth?.token) {
      showElement(loginPanel, true);
      showElement(authSummary, false);
      showElement(studentContent, false);
      showElement(roleMessage, false);
      scheduleBody.innerHTML = '<tr><td colspan="4">Sign in with a student account to load your schedule.</td></tr>';
      setStatus(statusElement, "Use the student demo account or your own student credentials.", "info");
      return;
    }

    try {
      const user = await fetchCurrentUser();

      showElement(authSummary, true);
      showElement(loginPanel, false);
      fillAuthSummary(authSummaryContent, user, `${user.role} account`);

      if (user.role !== "student") {
        showElement(studentContent, false);
        showElement(roleMessage, true);
        roleMessageText.textContent = "This page only allows student actions. Use the teacher portal for teacher accounts.";
        scheduleBody.innerHTML = '<tr><td colspan="4">Student schedule is unavailable for the current account.</td></tr>';
        setStatus(statusElement, `Signed in as ${user.name || user.username} (${user.role}).`, "info");
        return;
      }

      showElement(studentContent, true);
      showElement(roleMessage, false);
      await refreshStudentView(user);
    } catch (error) {
      console.error("Error loading student session:", error);
      clearStoredAuth();
      showElement(loginPanel, true);
      showElement(authSummary, false);
      showElement(studentContent, false);
      showElement(roleMessage, false);
      scheduleBody.innerHTML = '<tr><td colspan="4">Sign in with a student account to load your schedule.</td></tr>';
      setStatus(statusElement, error.message, "error");
    }
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const authState = await loginUser(usernameInput.value.trim(), passwordInput.value);
      loginForm.reset();
      setStatus(statusElement, `Login successful for ${authState.user.username}.`, "success");
      await applyStudentSession();
    } catch (error) {
      console.error("Error logging in student:", error);
      setStatus(statusElement, error.message, "error");
    }
  });

  enrollForm.addEventListener("submit", async event => {
    event.preventDefault();

    const courseCode = courseToAddSelect.value;

    if (!courseCode) {
      setStatus(statusElement, "Select a course to enroll.", "error");
      return;
    }

    try {
      const result = await sendJsonRequest(getApiUrl("/enroll"), {
        method: "POST",
        auth: true,
        body: JSON.stringify({ courseCode })
      });

      setStatus(statusElement, result.message, "success");
      courseToAddSelect.value = "";
      await applyStudentSession();
    } catch (error) {
      console.error("Error enrolling student:", error);
      setStatus(statusElement, error.message, "error");
    }
  });

  dropForm.addEventListener("submit", async event => {
    event.preventDefault();

    const courseCode = courseToDropSelect.value;

    if (!courseCode) {
      setStatus(statusElement, "Select an enrolled course to drop.", "error");
      return;
    }

    try {
      const result = await sendJsonRequest(getApiUrl("/drop"), {
        method: "POST",
        auth: true,
        body: JSON.stringify({ courseCode })
      });

      setStatus(statusElement, result.message, "success");
      courseToDropSelect.value = "";
      await applyStudentSession();
    } catch (error) {
      console.error("Error dropping course:", error);
      setStatus(statusElement, error.message, "error");
    }
  });

  logoutButton.addEventListener("click", () => {
    clearStoredAuth();
    loginForm.reset();
    setStatus(statusElement, "You have been signed out.", "info");
    applyStudentSession();
  });

  await applyStudentSession();
}

function createTeacherCourseRow(course) {
  const enrolledCount = getEnrolledCount(course);

  return `
    <tr>
      <td><strong>${escapeHtml(course.code)}</strong></td>
      <td>
        <div>${escapeHtml(course.title)}</div>
        <small>${escapeHtml(course.description || "No description")}</small>
      </td>
      <td>${escapeHtml(course.instructor)}</td>
      <td>${escapeHtml(course.schedule)}</td>
      <td><span class="badge">${enrolledCount} / ${escapeHtml(course.capacity)}</span></td>
      <td>${formatStudentRoster(course.students)}</td>
      <td class="table-actions">
        <button class="button button-secondary" type="button" data-action="edit" data-code="${escapeHtml(course.code)}">Edit</button>
        <button class="button" type="button" data-action="delete" data-code="${escapeHtml(course.code)}">Delete</button>
      </td>
    </tr>
  `;
}

async function initializeTeacherPage() {
  const loginForm = document.getElementById("teacher-login-form");
  const teacherForm = document.getElementById("teacher-course-form");
  const teacherCoursesBody = document.getElementById("teacher-courses-body");

  if (!loginForm || !teacherForm || !teacherCoursesBody) {
    return;
  }

  const loginPanel = document.getElementById("teacher-login-panel");
  const authSummary = document.getElementById("teacher-auth-summary");
  const authSummaryContent = document.getElementById("teacher-auth-summary-content");
  const logoutButton = document.getElementById("teacher-logout-button");
  const roleMessage = document.getElementById("teacher-role-message");
  const roleMessageText = document.getElementById("teacher-role-message-text");
  const teacherContent = document.getElementById("teacher-portal-content");
  const statusElement = document.getElementById("teacher-status");
  const formTitle = document.getElementById("teacher-form-title");
  const submitButton = document.getElementById("teacher-submit-button");
  const cancelEditButton = document.getElementById("teacher-cancel-edit");
  const usernameInput = document.getElementById("teacher-username");
  const passwordInput = document.getElementById("teacher-password");
  const courseCodeInput = document.getElementById("courseCode");
  const courseTitleInput = document.getElementById("courseTitle");
  const instructorInput = document.getElementById("instructor");
  const scheduleInput = document.getElementById("schedule");
  const creditsInput = document.getElementById("credits");
  const capacityInput = document.getElementById("capacity");
  const descriptionInput = document.getElementById("description");

  let courses = [];
  let editingCourseCode = null;

  function resetTeacherForm() {
    teacherForm.reset();
    editingCourseCode = null;
    courseCodeInput.disabled = false;
    formTitle.textContent = "Add a Course";
    submitButton.textContent = "Add Course";
    cancelEditButton.hidden = true;
  }

  function populateTeacherForm(course) {
    editingCourseCode = course.code;
    courseCodeInput.value = course.code;
    courseTitleInput.value = course.title;
    instructorInput.value = course.instructor;
    scheduleInput.value = course.schedule;
    creditsInput.value = String(course.credits);
    capacityInput.value = String(course.capacity);
    descriptionInput.value = course.description || "";
    courseCodeInput.disabled = true;
    formTitle.textContent = `Edit ${course.code}`;
    submitButton.textContent = "Save Changes";
    cancelEditButton.hidden = false;
  }

  async function refreshTeacherCourses(user) {
    courses = await fetchCourses();

    if (!Array.isArray(courses) || courses.length === 0) {
      teacherCoursesBody.innerHTML = renderMessageRow("No courses available.", 7);
    } else {
      teacherCoursesBody.innerHTML = courses.map(createTeacherCourseRow).join("");
    }

    fillAuthSummary(authSummaryContent, user, "teacher account");
    setStatus(statusElement, `Signed in as ${user.name || user.username}.`, "info");
  }

  async function applyTeacherSession() {
    const auth = getStoredAuth();

    if (!auth?.token) {
      showElement(loginPanel, true);
      showElement(authSummary, false);
      showElement(teacherContent, false);
      showElement(roleMessage, false);
      teacherCoursesBody.innerHTML = renderMessageRow("Sign in with a teacher account to manage courses.", 7);
      setStatus(statusElement, "Use the teacher demo account or your own teacher credentials.", "info");
      return;
    }

    try {
      const user = await fetchCurrentUser();

      showElement(authSummary, true);
      showElement(loginPanel, false);
      fillAuthSummary(authSummaryContent, user, `${user.role} account`);

      if (user.role !== "teacher") {
        showElement(teacherContent, false);
        showElement(roleMessage, true);
        roleMessageText.textContent = "This page only allows teacher actions. Use the student portal for student accounts.";
        teacherCoursesBody.innerHTML = renderMessageRow("Teacher management is unavailable for the current account.", 7);
        setStatus(statusElement, `Signed in as ${user.name || user.username} (${user.role}).`, "info");
        return;
      }

      showElement(teacherContent, true);
      showElement(roleMessage, false);
      await refreshTeacherCourses(user);
    } catch (error) {
      console.error("Error loading teacher session:", error);
      clearStoredAuth();
      showElement(loginPanel, true);
      showElement(authSummary, false);
      showElement(teacherContent, false);
      showElement(roleMessage, false);
      teacherCoursesBody.innerHTML = renderMessageRow("Sign in with a teacher account to manage courses.", 7);
      setStatus(statusElement, error.message, "error");
    }
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const authState = await loginUser(usernameInput.value.trim(), passwordInput.value);
      loginForm.reset();
      setStatus(statusElement, `Login successful for ${authState.user.username}.`, "success");
      await applyTeacherSession();
    } catch (error) {
      console.error("Error logging in teacher:", error);
      setStatus(statusElement, error.message, "error");
    }
  });

  teacherForm.addEventListener("submit", async event => {
    event.preventDefault();

    const payload = {
      code: courseCodeInput.value.trim().toUpperCase(),
      title: courseTitleInput.value.trim(),
      instructor: instructorInput.value.trim(),
      schedule: scheduleInput.value.trim(),
      credits: Number(creditsInput.value),
      capacity: Number(capacityInput.value),
      description: descriptionInput.value.trim()
    };

    try {
      const url = editingCourseCode
        ? getApiUrl(`/courses/${encodeURIComponent(editingCourseCode)}`)
        : getApiUrl("/courses");
      const method = editingCourseCode ? "PUT" : "POST";
      const result = await sendJsonRequest(url, {
        method,
        auth: true,
        body: JSON.stringify(payload)
      });

      setStatus(statusElement, result.message, "success");
      resetTeacherForm();
      await applyTeacherSession();
    } catch (error) {
      console.error("Error saving course:", error);
      setStatus(statusElement, error.message, "error");
    }
  });

  cancelEditButton.addEventListener("click", () => {
    resetTeacherForm();
    setStatus(statusElement, "Edit cancelled.", "info");
  });

  teacherCoursesBody.addEventListener("click", async event => {
    const actionButton = event.target.closest("button[data-action]");

    if (!actionButton) {
      return;
    }

    const { action, code } = actionButton.dataset;
    const selectedCourse = courses.find(course => course.code === code);

    if (!selectedCourse) {
      setStatus(statusElement, "That course could not be found in the current list.", "error");
      return;
    }

    if (action === "edit") {
      populateTeacherForm(selectedCourse);
      setStatus(statusElement, `Editing ${selectedCourse.code}.`, "info");
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm(`Delete ${selectedCourse.code} - ${selectedCourse.title}?`);

      if (!confirmed) {
        return;
      }

      try {
        const result = await sendJsonRequest(getApiUrl(`/courses/${encodeURIComponent(code)}`), {
          method: "DELETE",
          auth: true
        });

        setStatus(statusElement, result.message, "success");

        if (editingCourseCode === code) {
          resetTeacherForm();
        }

        await applyTeacherSession();
      } catch (error) {
        console.error("Error deleting course:", error);
        setStatus(statusElement, error.message, "error");
      }
    }
  });

  logoutButton.addEventListener("click", () => {
    clearStoredAuth();
    loginForm.reset();
    resetTeacherForm();
    setStatus(statusElement, "You have been signed out.", "info");
    applyTeacherSession();
  });

  resetTeacherForm();
  await applyTeacherSession();
}

window.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([
    initializeCoursesPage(),
    initializeStudentPage(),
    initializeTeacherPage()
  ]);
});