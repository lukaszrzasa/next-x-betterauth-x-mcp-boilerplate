/**
 * Saves text generated in the browser as a file, through a temporary object
 * URL that is released straight after the download starts. Nothing is sent
 * to a server.
 */
export function downloadTextFile(fileName: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
