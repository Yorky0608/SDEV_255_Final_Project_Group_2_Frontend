## Deployment Note

The frontend can be hosted on GitHub Pages, but the backend in `copy_backend_script.js` cannot. GitHub Pages only serves static files and does not run Node.js or Express.

To make the deployed frontend talk to the backend:

1. Deploy the Express backend to a Node host such as Render, Railway, or Cyclic.
2. Set the deployed backend origin in `config.js`, for example:

```javascript
window.COURSE_MANAGER_API_BASE_URL = "https://your-backend-service.example.com";
```

3. Keep `cors()` enabled on the backend so the GitHub Pages origin can call it.

For local development, leaving `config.js` empty will make the frontend use `http://localhost:5000` automatically.
