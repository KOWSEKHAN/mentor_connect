import { useState, useEffect } from 'react';

let toastId = 0;
let listeners = [];

export function showToast(message, type = 'success') {
  const id = toastId++;
  const toast = { id, message, type };
  listeners.forEach(listener => listener(toast));
  setTimeout(() => {
    listeners.forEach(listener => listener(null, id));
  }, 3000);
}

export function useToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const listener = (toast, removeId) => {
      if (removeId !== undefined) {
        setToasts(prev => prev.filter(t => t.id !== removeId));
      } else if (toast) {
        setToasts(prev => [...prev, toast]);
      }
    };
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }, []);

  return toasts;
}

export default function ToastContainer() {
  const toasts = useToast();

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-white ${
            toast.type === 'success' ? 'bg-green-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

