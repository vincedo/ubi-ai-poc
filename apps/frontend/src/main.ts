import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => {
  console.error(err);
  document.body.innerHTML = `
    <div style="max-width:600px;margin:80px auto;padding:24px;font-family:system-ui,sans-serif;text-align:center">
      <h1 style="font-size:1.25rem;margin-bottom:12px">Application failed to start</h1>
      <p style="color:#666;margin-bottom:16px">Please check the console for details or try refreshing the page.</p>
      <button onclick="location.reload()" style="padding:8px 20px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer">
        Reload
      </button>
    </div>
  `;
});
