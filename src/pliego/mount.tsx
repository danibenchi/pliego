// Punto de entrada de Pliego dentro del proyecto de Lovable. Se carga solo en el navegador:
// el motor (MuPDF en WebAssembly, en un Web Worker) no tiene sentido en el servidor.
import { App } from "./ui/App";
import "./pliego.css";
export default App;
