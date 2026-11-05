import fs from 'fs';
import path from 'path';

const cssPath = path.resolve('apps/user-web/src/styles/luno-v2.css');
let css = fs.readFileSync(cssPath, 'utf8');

const richMenuCss = `
/* LINE-style Interactive Rich Menu */
.pc-rich-menu-container {
  background: var(--ln-surface, #ffffff);
  border-top: 1px solid var(--ln-line, #e2e8f0);
  border-bottom: 1px solid var(--ln-line, #e2e8f0);
  overflow: hidden;
  transition: all 0.2s ease;
}
.rich-menu-toggle-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 16px;
  background: var(--ln-subtle, #f8fafc);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  color: var(--ln-muted, #64748b);
  border-bottom: 1px solid var(--ln-line, #e2e8f0);
}
.rich-menu-toggle-bar:hover {
  background: var(--ln-line, #f1f5f9);
}
.btn-rich-menu-toggle {
  background: transparent;
  border: none;
  font-size: 11px;
  color: var(--ln-accent, #06c755);
  font-weight: 700;
  cursor: pointer;
  padding: 2px 6px;
}
.rich-menu-grid {
  display: grid;
  background: var(--ln-surface, #ffffff);
  padding: 8px;
  gap: 8px;
  box-sizing: border-box;
}
.rich-menu-grid.grid_2x3 {
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 68px);
}
.rich-menu-grid.grid_1x3 {
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: 68px;
}
.rich-menu-tile-card {
  background: var(--ln-subtle, #f8fafc);
  border: 1px solid var(--ln-line, #e2e8f0);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.rich-menu-tile-card:hover {
  background: var(--ln-accent-soft, #e6f9ed);
  border-color: var(--ln-accent, #06c755);
  transform: translateY(-1px);
}
.rich-menu-tile-card:active {
  transform: translateY(1px);
}
.rich-menu-tile-card .tile-icon {
  font-size: 18px;
  margin-bottom: 2px;
}
.rich-menu-tile-card .tile-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ln-text, #1e293b);
}
`;

if (!css.includes('.pc-rich-menu-container')) {
  css += richMenuCss;
  fs.writeFileSync(cssPath, css, 'utf8');
  console.log('Appended Rich Menu styles to luno-v2.css');
}

