/** Browser uploads need file bytes; React Native's fetch accepts a local URI descriptor. */
export async function photoForm(uris: string[], platform: string): Promise<FormData> {
  const form = new FormData();
  for (const [index, uri] of uris.entries()) {
    const name = `item-${index}.jpg`;
    if (platform === 'web') {
      const response = await fetch(uri);
      if (!response.ok) throw new Error('Could not read a selected photo. Please select it again.');
      form.append('photos', await response.blob(), name);
    } else {
      form.append('photos', { uri, name, type: 'image/jpeg' } as unknown as Blob);
    }
  }
  return form;
}
