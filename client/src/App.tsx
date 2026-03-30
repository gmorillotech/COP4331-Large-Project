import { useEffect, useState } from "react";
import { buildPath } from "./Path";

function App() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(buildPath("api/health"))
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch((err) => console.error(err));
  }, []);

  return (
    <div>
      <h1>MERN Stack Test</h1>
      <p>Backend says: {message}</p>
    </div>
  );
}

export default App;