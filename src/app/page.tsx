'use client';

import { useSmoothScroll } from '@/hooks/useSmoothScroll';
import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import Partners from '@/components/landing/Partners';
import Features from '@/components/landing/Features';
import HowItWorks from '@/components/landing/HowItWorks';
import Stats from '@/components/landing/Stats';
import Services from '@/components/landing/Services';
import Testimonials from '@/components/landing/Testimonials';

import About from '@/components/landing/About';
import Contact from '@/components/landing/Contact';
import CTA from '@/components/landing/CTA';
import Footer from '@/components/landing/Footer';

export default function LandingPage() {
  const { scrollTo } = useSmoothScroll();

  return (
    <div className="bg-white min-h-screen">
      <Navbar scrollTo={scrollTo} />
      <Hero />
      <Partners />
      <Features />
      <HowItWorks />
      <Stats />
      <Services />
      <Testimonials />

      <About />
      <Contact />
      <CTA />
      <Footer />
    </div>
  );
}
