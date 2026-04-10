/**
 * Map `lion_category` strings from The Work onto hub URL slugs (see scrape-cannes-category-entry-counts.mjs).
 * Handles spelling/casing variants seen in scraped data.
 */
export const LION_CATEGORY_TO_SLUG = {
  "Audio & Radio Lions": "audio-radio",
  "Radio & Audio Lions": "audio-radio",
  "Film Lions": "film",
  "Outdoor Lions": "outdoor",
  "Print & Publishing Lions": "print-publishing",
  "Design Lions": "design",
  "Product Design Lions": "design",
  "Digital Craft Lions": "digital-craft",
  "Film Craft Lions": "film-craft",
  "Industry Craft Lions": "industry-craft",
  "Creative B2B Lions": "creative-b2b",
  "Creative Data Lions": "creative-data",
  "Direct Lions": "direct",
  "Media Lions": "media",
  "Mobile Lions": "media",
  "PR Lions": "pr",
  "Social & Creator Lions": "social-creator",
  "Social & Influencer Lions": "social-creator",
  "Entertainment Lions": "entertainment",
  "Entertainment Lions For Gaming": "entertainment-lions-for-gaming",
  "Entertainment Lions for Gaming": "entertainment-lions-for-gaming",
  "Entertainment Lions For Music": "entertainment-lions-for-music",
  "Entertainment Lions for Music": "entertainment-lions-for-music",
  "Entertainment for Music Lions": "entertainment-lions-for-music",
  "Entertainment Lions For Sport": "entertainment-lions-for-sport",
  "Entertainment Lions for Sport": "entertainment-lions-for-sport",
  "Entertainment for Sport Lions": "entertainment-lions-for-sport",
  "Brand Experience & Activation Lions": "brand-experience-activation",
  "Creative Business Transformation Lions": "creative-business-transformation",
  "Creative Commerce Lions": "creative-commerce",
  "Creative eCommerce Lions": "creative-commerce",
  "Innovation Lions": "innovation",
  "Luxury Lions": "luxury",
  "Luxury & Lifestyle Lions": "luxury",
  "Glass Lions": "glass-the-lion-for-change",
  "Glass: The Lion For Change": "glass-the-lion-for-change",
  "Glass: The Lion for Change": "glass-the-lion-for-change",
  "Sustainable Development Goals Lions": "sustainable-development-goals",
  "Health & Wellness Lions": "health-wellness",
  "Pharma Lions": "pharma",
  "Creative Effectiveness Lions": "creative-effectiveness",
  "Creative Strategy Lions": "creative-strategy",
  "Titanium Lions": "titanium",
  "Grand Prix For Good Lions": "creative-effectiveness",
  "Grand Prix for Good Lions": "creative-effectiveness",
  "Lions Health Grand Prix for Good": "health-wellness",
};

export function lionCategoryToSlug(lionCategory) {
  if (lionCategory == null) return null;
  const k = String(lionCategory).trim();
  if (LION_CATEGORY_TO_SLUG[k]) return LION_CATEGORY_TO_SLUG[k];
  return null;
}
