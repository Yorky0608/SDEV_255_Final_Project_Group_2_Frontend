function resolveApiBaseUrl() {
  const configuredBaseUrl = typeof window !== "undefined"
    ? window.COURSE_MANAGER_API_BASE_URL
    : "";

  if (typeof configuredBaseUrl === "string" && configuredBaseUrl.trim()) {
    return configuredBaseUrl.trim().replace(/\/$/, "");
  }

  const hostname = typeof window !== "undefined" ? window.location.hostname : "";

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:5000";
  }

  return null;
}

const API_BASE_URL = resolveApiBaseUrl();

function getApiUrl(path) {
  if (!API_BASE_URL) {
    throw new Error(
      "Backend URL is not configured. Set window.COURSE_MANAGER_API_BASE_URL in config.js to your deployed backend URL."
    );
  }

  return `${API_BASE_URL}${path}`;
}

function renderMessageRow(message) {
  return `<tr><td colspan="6">${message}</td></tr>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchCourses() {
  const response = await fetch(getApiUrl("/courses"));

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

async function sendJsonRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

function setStatus(element, message, type = "info") {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.dataset.state = message ? type : "";
}

function createCourseRow(course) {
  const enrolledCount = Array.isArray(course.students) ? course.students.length : 0;

  return `
    <tr>
      <td><strong>${escapeHtml(course.code)}</strong></td>
      <td>${escapeHtml(course.title)}</td>
      <td>${escapeHtml(course.credits)}</td>
      <td>${escapeHtml(course.instructor)}</td>
      <td>${escapeHtml(course.schedule)}</td>
      <td><span class="badge">${enrolledCount} / ${course.capacity}</span></td>
    </tr>
  `;
}

async function loadCourses() {
  const coursesTableBody = document.getElementById("courses-table-body");

  if (!coursesTableBody) {
    return;
  }

  try {
    const courses = await fetchCourses();

    if (!Array.isArray(courses) || courses.length === 0) {
      coursesTableBody.innerHTML = renderMessageRow("No courses available.");
      return;
    }

    coursesTableBody.innerHTML = courses.map(createCourseRow).join("");
  } catch (error) {
    console.error("Error fetching courses:", error);
    coursesTableBody.innerHTML = renderMessageRow(
      error.message
    );
  }
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
      <td><span class="badge">Enrolled</span></td>
    </tr>
  `;
}

async function initializeStudentPage() {
  const enrollForm = document.getElementById("enroll-form");
  const dropForm = document.getElementById("drop-form");

  if (!enrollForm || !dropForm) {
    return;
  }

  const studentIdInput = document.getElementById("studentId");
  const studentIdDropInput = document.getElementById("studentIdDrop");
  const courseToAddSelect = document.getElementById("courseToAdd");
  const courseToDropSelect = document.getElementById("courseToDrop");
  const scheduleBody = document.getElementById("student-schedule-body");
  const statusElement = document.getElementById("student-status");

  async function refreshStudentView() {
    const currentStudentId = studentIdInput.value.trim() || studentIdDropInput.value.trim();

    if (studentIdInput.value !== currentStudentId) {
      studentIdInput.value = currentStudentId;
    }

    if (studentIdDropInput.value !== currentStudentId) {
      studentIdDropInput.value = currentStudentId;
    }

    try {
      const courses = await fetchCourses();
      const enrolledCourses = currentStudentId
        ? courses.filter(course => Array.isArray(course.students) && course.students.includes(currentStudentId))
        : [];
      const availableCourses = currentStudentId
        ? courses.filter(course => !Array.isArray(course.students) || !course.students.includes(currentStudentId))
        : courses;

      courseToAddSelect.innerHTML = `<option value="">Select a course...</option>${availableCourses.map(createCourseOption).join("")}`;
      courseToDropSelect.innerHTML = `<option value="">Select an enrolled course...</option>${enrolledCourses.map(createCourseOption).join("")}`;

      if (!currentStudentId) {
        scheduleBody.innerHTML = '<tr><td colspan="4">Enter a student ID to see your enrolled courses.</td></tr>';
        return;
      }

      if (enrolledCourses.length === 0) {
        scheduleBody.innerHTML = '<tr><td colspan="4">You are not enrolled in any courses yet.</td></tr>';
        return;
      }

      scheduleBody.innerHTML = enrolledCourses.map(createStudentScheduleRow).join("");
    } catch (error) {
      console.error("Error loading student data:", error);
        setStatus(statusElement, error.message, "error");
      scheduleBody.innerHTML = '<tr><td colspan="4">Unable to load schedule.</td></tr>';
    }
  }

  studentIdInput.addEventListener("input", refreshStudentView);
  studentIdDropInput.addEventListener("input", refreshStudentView);

  enrollForm.addEventListener("submit", async event => {
    event.preventDefault();

    const studentId = studentIdInput.value.trim();
    const courseCode = courseToAddSelect.value;

    if (!studentId || !courseCode) {
      setStatus(statusElement, "Enter a student ID and select a course to enroll.", "error");
      return;
    }

    try {
      const result = await sendJsonRequest(getApiUrl("/enroll"), {
        method: "POST",
        body: JSON.stringify({ studentId, courseCode })
      });

      setStatus(statusElement, result.message, "success");
      courseToAddSelect.value = "";
      await refreshStudentView();
    } catch (error) {
      console.error("Error enrolling student:", error);
      setStatus(statusElement, error.message, "error");
    }
  });

  dropForm.addEventListener("submit", async event => {
    event.preventDefault();

    const studentId = studentIdDropInput.value.trim();
    const courseCode = courseToDropSelect.value;

    if (!studentId || !courseCode) {
      setStatus(statusElement, "Enter a student ID and select an enrolled course to drop.", "error");
      return;
    }

    try {
      const result = await sendJsonRequest(getApiUrl("/drop"), {
        method: "POST",
        body: JSON.stringify({ studentId, courseCode })
      });

      setStatus(statusElement, result.message, "success");
      courseToDropSelect.value = "";
      await refreshStudentView();
    } catch (error) {
      console.error("Error dropping course:", error);
      setStatus(statusElement, error.message, "error");
    }
  });

  await refreshStudentView();
}

function createTeacherCourseRow(course) {
  const enrolledCount = Array.isArray(course.students) ? course.students.length : 0;

  return `
    <tr>
      <td><strong>${escapeHtml(course.code)}</strong></td>
      <td>
        <div>${escapeHtml(course.title)}</div>
        <small>${escapeHtml(course.description || "No description")}</small>
      </td>
      <td>${escapeHtml(course.instructor)}</td>
      <td>${escapeHtml(course.schedule)}</td>
      <td><span class="badge">${enrolledCount} / ${course.capacity}</span></td>
      <td class="table-actions">
        <button class="button button-secondary" type="button" data-action="edit" data-code="${escapeHtml(course.code)}">Edit</button>
        <button class="button" type="button" data-action="delete" data-code="${escapeHtml(course.code)}">Delete</button>
      </td>
    </tr>
  `;
}

async function initializeTeacherPage() {
  const teacherForm = document.getElementById("teacher-course-form");
  const teacherCoursesBody = document.getElementById("teacher-courses-body");

  if (!teacherForm || !teacherCoursesBody) {
    return;
  }

  const statusElement = document.getElementById("teacher-status");
  const formTitle = document.getElementById("teacher-form-title");
  const submitButton = document.getElementById("teacher-submit-button");
  const cancelEditButton = document.getElementById("teacher-cancel-edit");
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

  async function refreshTeacherCourses() {
    try {
      courses = await fetchCourses();

      if (!Array.isArray(courses) || courses.length === 0) {
        teacherCoursesBody.innerHTML = renderMessageRow("No courses available.");
        return;
      }

      teacherCoursesBody.innerHTML = courses.map(createTeacherCourseRow).join("");
    } catch (error) {
      console.error("Error loading teacher courses:", error);
      teacherCoursesBody.innerHTML = renderMessageRow("Unable to load courses.");
      setStatus(statusElement, "Unable to load courses. Make sure the backend is running.", "error");
    }
  }

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
        body: JSON.stringify(payload)
      });

      setStatus(statusElement, result.message, "success");
      resetTeacherForm();
      await refreshTeacherCourses();
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
          method: "DELETE"
        });

        setStatus(statusElement, result.message, "success");

        if (editingCourseCode === code) {
          resetTeacherForm();
        }

        await refreshTeacherCourses();
      } catch (error) {
        console.error("Error deleting course:", error);
        setStatus(statusElement, error.message, "error");
      }
    }
  });

  resetTeacherForm();
  await refreshTeacherCourses();
}

window.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([loadCourses(), initializeStudentPage(), initializeTeacherPage()]);
});