// The logo ident: an animated intro for the front of a film and a closing card for the end. Replace
// the logo and the words; scripts/build.mjs renders both (or: npm run ident).
export const IDENT = {
  // Any SVG. Each filled shape is extruded in front of the one before it, in its own colour.
  logo: '/ident/logo.svg',
  // Shapes (by order in the file, from 0) finished as polished metal, which takes the glint.
  metal: [2],
  // The name under the mark in the intro, and above the title on the closing card.
  name: 'Your Studio',
  // The closing card.
  title: 'Product Name',
  tag: 'One line on what it does.',
  fine: 'Filmed from the running build.',
};
