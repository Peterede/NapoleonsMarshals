import './style.css';
import { GameApp } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root');
new GameApp(root);
