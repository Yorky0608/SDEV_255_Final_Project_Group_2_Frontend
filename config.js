const isLocalFrontendHost = typeof window !== "undefined"
	&& (!window.location.hostname || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

window.COURSE_MANAGER_API_BASE_URL = isLocalFrontendHost
	? ""
	: "https://sdev-255-final-project-group-2-backend.onrender.com";
