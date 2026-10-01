# Frog Game

A React + Vite game, optimized to run on smart TV browsers, embedded in a host page via `<iframe>`.

## Embedding (iframe integration)

The game expects to run inside an `<iframe>` on a host TV app page, and has no way to close its own tab/frame. Instead, pressing the remote's **Back** button posts a message to the parent window and leaves the actual closing (removing/hiding the iframe) to the host:

```js
window.addEventListener('message', (event) => {
  if (event.data?.type === 'frog-game:close') {
    // e.g. remove or hide the iframe
  }
});
```

See `src/hooks/useExitOnRemoteBack.js` for the key codes/names it listens for (LG webOS, Samsung Tizen) and why Escape/Backspace are deliberately excluded. Ported from the sibling Eggcatcher-/skatting-mummy projects' identical hook.

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
