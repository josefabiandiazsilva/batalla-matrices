/* ======================================================================
   CONFIGURACIÓN DE FIREBASE — reemplaza los valores de abajo
   ======================================================================
   1) Ve a https://console.firebase.google.com y crea un proyecto gratuito
      (plan "Spark", sin costo).
   2) En el menú izquierdo: Compilación > Realtime Database > Crear base
      de datos. Elige cualquier región. Cuando pregunte por las reglas de
      seguridad, puedes iniciar en "modo de prueba" y luego pegar el
      contenido de database.rules.json (raíz del proyecto) en la pestaña
      "Reglas" de la consola.
   3) Ve a Configuración del proyecto (ícono de engranaje) > "Tus apps" >
      ícono Web "</>" > registra la app (no necesitas Firebase Hosting).
   4) Copia el objeto firebaseConfig que te muestra la consola y pégalo
      reemplazando el que está abajo. El dato clave es "databaseURL":
      sin él, el juego no podrá sincronizar nada.
   ====================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyAaeei8WdkeRgLoBzTFkS5KAryqmMxnaZ0",
  authDomain: "batalla-matrices.firebaseapp.com",
  databaseURL: "https://batalla-matrices-default-rtdb.firebaseio.com",
  projectId: "batalla-matrices",
  storageBucket: "batalla-matrices.firebasestorage.app",
  messagingSenderId: "947798119894",
  appId: "1:947798119894:web:d438b9517e863ab4e2c077"
};

firebase.initializeApp(firebaseConfig);
window.db = firebase.database();

// Aviso en pantalla si el profesor olvidó reemplazar la configuración.
window.FIREBASE_CONFIGURED = firebaseConfig.apiKey.indexOf("PEGA_AQUI") === -1;
