# Comprehensive Prompt for Building Blujay Logistics Landing Page

---

## PROJECT OVERVIEW

Build a premium, futuristic landing page for **Blujay Logistics** - a courier aggregator platform similar to Shiprocket. The landing page must look like it was designed by a team of senior UI/UX designers and experienced web developers with 10+ years of expertise. Every micro-detail matters - from animations to spacing to typography to color transitions.

---

## CURRENT SYSTEM CONTEXT

- **Current State**: The client login page (`/client-dashboard`) is currently the default landing page
- **Required Change**: Create a new stunning landing page as the default route (`/`)
- **Navigation Flow**:
  - When users click **"Get Started"** or **"Sign Up"** → Navigate to `/client-signup`
  - When users click **"Login"** → Navigate to `/client-login`
  - The new landing page becomes the main entry point

---

## COLOR PALETTE (Extract from Dashboard)

Use these exact colors to maintain brand consistency:

```
Primary Colors:
- Midnight Blue (Sidebar/Dark BG): #0f172a
- Primary Blue: #3b82f6
- Light Blue: #60a5fa
- Lighter Blue: #93c5fd

Accent Colors:
- Success Green: #22c55e (for positive metrics)
- Warning Orange: #f97316 (for alerts)
- Cyan Accent: #06b6d4

Backgrounds:
- Dark Background: #0f172a
- Card Background: #1e293b
- Light Surface: #f8fafc

Text Colors:
- Primary Text: #ffffff
- Secondary Text: #94a3b8
- Muted Text: #64748b
```

---

## REQUIRED PACKAGES/DEPENDENCIES TO INSTALL

### Motion & Animation Libraries:
```bash
npm install framer-motion
npm install lenis  # For buttery smooth scrolling
npm install gsap  # For advanced timeline animations (optional but powerful)
npm install @formkit/auto-animate  # For automatic animations
```

### Icon Libraries:
```bash
npm install lucide-react  # Modern, clean icons (recommended as primary)
npm install react-icons  # Access to 50,000+ icons from multiple packs
```

### Additional Enhancements:
```bash
npm install clsx  # For conditional classnames
npm install tailwind-merge  # For merging Tailwind classes
```

---

## LANDING PAGE STRUCTURE & SECTIONS

### 1. NAVIGATION HEADER (Sticky/Fixed)
- **Logo**: "B" icon with gradient + "Blujay Logistics" text
- **Nav Links** (scroll to section on same page):
  - About Us → scrolls to `#about`
  - Services → scrolls to `#services`
  - Contact Us → scrolls to `#contact`
- **CTA Buttons**:
  - "Login" button (outlined style) → `/client-login`
  - "Get Started" button (filled/gradient) → `/client-signup`
- **Behavior**: Glassmorphism effect on scroll, smooth hide/show on scroll direction

### 2. HERO SECTION
- Large headline with gradient text animation
- Subheadline explaining the value proposition
- Animated 3D mockup or floating dashboard preview
- Dual CTA buttons: "Start Shipping Now" + "Watch Demo"
- Floating particles or mesh gradient background
- Animated statistics counters

### 3. TRUSTED PARTNERS/LOGOS SECTION
- Infinite horizontal scroll of courier partner logos
- Logos like: Delhivery, BlueDart, DTDC, Ekart, Shadowfax, Xpressbees, etc.

### 4. FEATURES SECTION
- Bento grid layout with animated cards
- Features: Rate Comparison, Multi-carrier Integration, Real-time Tracking, Analytics Dashboard, Wallet System, Auto-allocation
- Each card with icon, title, description, and hover animations

### 5. HOW IT WORKS SECTION
- 3-4 step process with connecting animated lines
- Steps: Sign Up → Connect Store → Compare Rates → Ship
- Animated illustrations for each step

### 6. STATISTICS SECTION
- Animated counters: Total Shipments, Cities Covered, Happy Customers, Courier Partners
- Parallax background effect

### 7. SERVICES SECTION (`#services`)
- Cards for different shipping services
- Express Delivery, Standard Shipping, COD Services, Reverse Logistics, Hyperlocal Delivery
- Interactive hover states with depth

### 8. TESTIMONIALS SECTION
- Carousel/slider with customer reviews
- Company logos, names, ratings
- Smooth auto-scroll with pause on hover

### 9. PRICING SECTION
- Transparent pricing cards
- Free tier vs Premium comparison
- Animated "Most Popular" badge

### 10. ABOUT US SECTION (`#about`)
- Company story, mission, vision
- Team or company values with icons
- Achievement timeline

### 11. CONTACT SECTION (`#contact`)
- Contact form with animated inputs
- Office locations with map preview
- Social media links
- Support email and phone

### 12. FINAL CTA SECTION
- Large call-to-action with gradient background
- "Ready to Transform Your Shipping?" headline
- Single prominent "Get Started Free" button → `/client-signup`

### 13. FOOTER
- Organized link columns
- Newsletter subscription
- Social media icons
- Copyright and legal links

---

## DESIGN SPECIFICATIONS

### Typography:
- **Display Font**: Clash Display or similar premium geometric sans-serif
- **Body Font**: Satoshi, Inter, or similar clean sans-serif
- **Mono Font**: JetBrains Mono (for any code/numbers)

### Animation Guidelines:
- Use Framer Motion for all scroll-triggered animations
- Implement Lenis for smooth scrolling experience
- Stagger animations for lists and grids
- Subtle hover micro-interactions on all interactive elements
- Page load animation sequence
- Parallax effects on backgrounds

### Visual Effects:
- Glassmorphism cards with backdrop blur
- Gradient mesh backgrounds
- Subtle grid pattern overlays
- Floating particle effects
- Glow effects on CTAs and important elements
- Noise texture overlays for depth

### Responsive Design:
- Mobile-first approach
- Breakpoints: sm(640px), md(768px), lg(1024px), xl(1280px), 2xl(1536px)
- Touch-friendly interactions on mobile
- Hamburger menu for mobile navigation

---

## ANIMATION SPECIFICATIONS

```javascript
// Scroll reveal animation preset
const fadeUpVariant = {
  hidden: { opacity: 0, y: 60 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  }
}

// Stagger children animation
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 }
  }
}

// Smooth scroll with Lenis
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
})
```

---

## NAVIGATION SCROLL BEHAVIOR

When clicking nav links (About Us, Services, Contact Us), implement smooth scroll to the respective section:

```javascript
const scrollToSection = (sectionId) => {
  const element = document.getElementById(sectionId);
  lenis.scrollTo(element, { offset: -80, duration: 1.5 });
}
```

---

## QUALITY CHECKLIST

- [ ] Loading animation/splash screen
- [ ] All animations are smooth (60fps)
- [ ] Proper hover states on all interactive elements
- [ ] Focus states for accessibility
- [ ] Responsive on all screen sizes
- [ ] Dark theme consistency throughout
- [ ] Gradient text effects working
- [ ] Smooth scrolling implemented
- [ ] Navigation highlights active section
- [ ] Forms have proper validation styling
- [ ] Images optimized and lazy loaded
- [ ] Performance optimized (Lighthouse 90+)

---

## IMPORTANT NOTES

1. **DO NOT** create separate pages for About, Services, Contact - they are sections on the same landing page
2. **DO** ensure the landing page is the new default route (`/`)
3. **DO** make the design feel premium and futuristic - avoid generic templates
4. **DO** pay attention to micro-interactions and small details
5. **DO** use the exact color palette from the dashboard for brand consistency
6. **DO** implement proper loading states and skeleton screens
7. **DO** add subtle sound effects consideration (optional, muted by default)

---

## FILE STRUCTURE SUGGESTION

```
src/
├── pages/
│   └── LandingPage.jsx (new default route)
├── components/
│   └── landing/
│       ├── Navbar.jsx
│       ├── Hero.jsx
│       ├── Partners.jsx
│       ├── Features.jsx
│       ├── HowItWorks.jsx
│       ├── Stats.jsx
│       ├── Services.jsx
│       ├── Testimonials.jsx
│       ├── Pricing.jsx
│       ├── About.jsx
│       ├── Contact.jsx
│       ├── CTA.jsx
│       ├── Footer.jsx
│       └── ParticleBackground.jsx
├── hooks/
│   └── useSmoothScroll.js
└── utils/
    └── animations.js
```

---

Build this landing page with the mindset that it will be the first impression for thousands of potential customers. Every pixel, every animation, every interaction should feel intentional and premium.