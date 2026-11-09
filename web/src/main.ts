import '@fontsource-variable/inter';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { boot } from './lib/store.svelte.ts';
import { installGlobalErrorReporting } from './lib/report.ts';

installGlobalErrorReporting();


mount(App, { target: document.getElementById('app')! });
boot();
