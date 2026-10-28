export const CLASS_LOCATIONS = {
  "中山國小": {
    address: "104 臺北市中山區新生北路三段65-1號",
  },
  "松江南京｜A 教室": {
    address: "10491 臺北市中山區四平街93號B1",
  },
  "松江南京｜B 教室": {
    address: "10491 臺北市中山區四平街93號B1",
  },
} as const;

export function getClassLocationAddress(location: string): string {
  if (Object.prototype.hasOwnProperty.call(CLASS_LOCATIONS, location)) {
    return CLASS_LOCATIONS[location as keyof typeof CLASS_LOCATIONS].address;
  }

  return "";
}

export function getClassLocationMapsUrl(location: string): string {
  const address = getClassLocationAddress(location);

  if (!address) return "";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}