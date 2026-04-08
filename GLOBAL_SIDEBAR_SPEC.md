# 🎨 GLOBAL SIDEBAR DESIGN SPEC

**Ziel:** Einheitliche Sidebar-Komponente für alle BLUN-Unterseiten (Dashboard, Billing, Models, Websites, Software)

---

## 📐 **DESIGN LAYOUT**

### **Sidebar Dimensionen:**
- **Width:** 240px (Desktop) / 100% mit Drawer (Mobile)
- **Height:** 100vh (full viewport)
- **Position:** Fixed, left-aligned
- **Z-Index:** 1000+ (für Mobile-Drawer)

### **Color Scheme (Dark Mode - BLUN Standard):**
```
Background:      #111 (--bg2)
Border:          #2a2a2a (--brd)
Text Primary:    #e5e5e5 (--tx)
Text Secondary:  #888 (--tx2)
Accent (Blue):   #3b82f6 (--b)
Accent (Dark):   #2563eb (--bd)
Green (Active):  #22c55e (--green)
```

---

## 🏗️ **SIDEBAR STRUCTURE**

### **1. HEADER SECTION** (`.sidebar-head`)
```
┌─────────────────────┐
│ BL UN               │
│ User Name           │
└─────────────────────┘
```
- Logo: "BL" (white) + "UN" (blue)
- User Name: Small text, gray, with avatar icon
- Padding: 20px
- Border-bottom: 1px solid var(--brd)

### **2. NAVIGATION SECTION** (`.sidebar-nav`)
```
┌─────────────────────┐
│ HAUPTMENÜ           │
│ 📊 Dashboard        │
│ 🤖 Agents           │
│ 🛍️  Marketplace      │
│ 💬 Chat             │
│ 🎨 Canvas           │
│ 💰 Affiliate        │
│ ⚙️  Einstellungen    │
└─────────────────────┘
```
- Each nav item: Icon + Label
- Hover state: 3% white overlay
- Active state: Blue left border (3px) + 8% blue background
- Padding: 10px 16px
- Gap: 10px (icon to label)

### **3. FOOTER SECTION** (`.sidebar-foot`)
```
┌─────────────────────┐
│ Logout Button       │
└─────────────────────┘
```
- Full-width button
- Red outline, red hover background
- Padding: 8px
- Border: 1px solid rgba(239, 68, 68, 0.3)

---

## 📱 **MOBILE RESPONSIVE**

### **Breakpoint: < 768px**
- **Desktop Sidebar:** Hidden (display: none)
- **Mobile Drawer:** 
  - Full-width overlay Drawer (width: 100%)
  - Overlay backdrop: rgba(0, 0, 0, 0.7)
  - Slide-in from left animation
  - Z-index: 1000 (overlays main content)
  - Hamburger menu toggle button in topbar

### **Toggle Button:**
- Position: Top-left of main content area
- Icon: ☰ (hamburger) or ✕ (close when open)
- When clicked: Drawer opens/closes with slide animation

---

## 🔄 **STATE MANAGEMENT**

### **Collapsed/Expanded State:**
- **Desktop:**
  - Expanded (default): 240px width, full text labels
  - Collapsed: 60px width, icons only, labels hidden on hover
  - Toggle button: Arrow icon in header
  
- **Mobile:**
  - Hidden by default
  - Open as full-screen Drawer
  - Close with X button or backdrop click

### **Persistence (localStorage):**
```javascript
localStorage.setItem('sidebarState', JSON.stringify({
  collapsed: false,  // or true
  mobileOpen: false   // for mobile drawer
}))
```

---

## 🎯 **NAVIGATION PAGES**

The Sidebar should route to these pages:
- `#dashboard` → `/dashboard/index.html`
- `#agents` → `/dashboard/index.html?section=agents`
- `#marketplace` → `/dashboard/index.html?section=marketplace`
- `#chat` → `/dashboard/index.html?section=chat`
- `#canvas` → `/dashboard/index.html?section=canvas`
- `#affiliate` → `/dashboard/index.html?section=affiliate`
- `#settings` → `/dashboard/index.html?section=settings`

---

## 📊 **IMPLEMENTATION PLAN**

### **Phase 1: Shared Component**
1. Extract Sidebar HTML/CSS/JS from `dashboard/index.html`
2. Create: `dashboard/components/GlobalSidebar.js` (class)
3. Create: `dashboard/components/global-sidebar.css`

### **Phase 2: Integration**
1. Update `dashboard/index.html` to import GlobalSidebar
2. Update `dashboard/billing.html` to include GlobalSidebar
3. Update `dashboard/models.html` to include GlobalSidebar
4. Update `dashboard/websites.html` to include GlobalSidebar
5. Update `dashboard/software.html` to include GlobalSidebar
6. Remove duplicate navbar HTML from each page

### **Phase 3: Mobile + Collapse**
1. Add toggle button for collapse (desktop)
2. Add hamburger menu + drawer (mobile)
3. Implement localStorage persistence
4. Test responsive behavior

---

## 🎨 **VISUAL MOCKUP (ASCII)**

### **Desktop (Expanded):**
```
┌────────────┬──────────────────────────┐
│ BL UN      │                          │
│ User       │                          │
├────────────┤        MAIN CONTENT      │
│ 📊 Dash    │                          │
│ 🤖 Agents  │                          │
│ 🛍️ Market  │                          │
│ 💬 Chat    │                          │
│ 🎨 Canvas  │                          │
│ 💰 Aff     │                          │
│ ⚙️ Settings│                          │
├────────────┤                          │
│ Logout     │                          │
└────────────┴──────────────────────────┘
```

### **Desktop (Collapsed):**
```
┌──┬──────────────────────────┐
│B◄│                          │
│U│├──────────────────────────┤
├──┤        MAIN CONTENT      │
│📊│                          │
│🤖│                          │
│🛍️│                          │
│💬│                          │
│🎨│                          │
│💰│                          │
│⚙️│                          │
├──┤                          │
│  │                          │
└──┴──────────────────────────┘
```

### **Mobile (Drawer):**
```
┌─────────────┬─────────────────┐
│ ☰ Content   │ ✕ Sidebar       │
│             │ BL UN           │
│             │ User            │
│             │ ────────────    │
│             │ 📊 Dashboard    │
│             │ 🤖 Agents       │
│             │ 🛍️ Marketplace   │
│             │ 💬 Chat         │
│             │ 🎨 Canvas       │
│             │ 💰 Affiliate    │
│             │ ⚙️ Settings      │
│             │ ────────────    │
│             │ Logout          │
└─────────────┴─────────────────┘
```

---

## 🔗 **RELATED FILES**

- **Current Sidebar JS:** `dashboard/js/nav-sidebar.js`
- **Current Sidebar CSS:** Embedded in `dashboard/index.html` `<style>`
- **Target Implementation:** 
  - `dashboard/components/GlobalSidebar.js` (new)
  - `dashboard/components/global-sidebar.css` (new)
  - Update all 5 HTML files (billing, models, websites, software, index)

---

## ✅ **DESIGN CHECKLIST**

- [ ] Sidebar is 240px wide (desktop)
- [ ] Navigation items have icons + labels
- [ ] Active item has blue accent + border
- [ ] Collapsed state: icons only
- [ ] Mobile: Full-width drawer with overlay
- [ ] localStorage persistence for state
- [ ] Smooth animations (150ms transitions)
- [ ] All 5 pages import the same component
- [ ] Responsive breakpoint at 768px
- [ ] Dark mode colors applied consistently
- [ ] Accessibility: ARIA labels on nav items
- [ ] Touch-friendly mobile drawer (big touch targets)

---

**Next:** Coordinate with Hanno for visual design refinements, then implement in Phase 1-3.
