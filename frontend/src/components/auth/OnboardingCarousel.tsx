"use client";

import React from "react";
import { CaretRight } from "@phosphor-icons/react";
import { AUTH_MESSAGES, ONBOARDING_SLIDES } from "@/lib/messages/auth-messages";

export interface OnboardingCarouselProps {
  slideIndex: number;
  onSelectSlide: (idx: number) => void;
  onNext: () => void;
  onSkip: () => void;
  onCancel?: () => void;
}

/**
 * 4-step curved-arc onboarding carousel following the Stitch welcome prototype.
 */
export function OnboardingCarousel({
  slideIndex,
  onSelectSlide,
  onNext,
  onSkip,
  onCancel,
}: OnboardingCarouselProps): React.JSX.Element {
  const currentSlide = ONBOARDING_SLIDES[slideIndex] || ONBOARDING_SLIDES[0];
  const isLastSlide = slideIndex === ONBOARDING_SLIDES.length - 1;

  return (
    <main className="w-full min-h-dvh bg-canvas text-ink-primary flex flex-col justify-between font-sans select-none safe-areas overflow-x-hidden">
      {/* Top Two-Tone Arc matching Stitch Prototype (Full-Width Edge-to-Edge) */}
      <div className="relative w-full">
        <div className="w-full bg-surface-inset rounded-b-[44px] pt-4 pb-20 px-6 relative flex flex-col items-center">
          {/* Top Navigation Row (Cancelar / Saltar) */}
          <div className="w-full max-w-md mx-auto flex justify-between items-center text-ink-primary font-semibold text-ios-subhead">
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="text-ink-secondary hover:text-ink-primary py-1 px-1 transition-colors"
              >
                {AUTH_MESSAGES.cancelButton}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onSkip}
              className="text-ink-secondary hover:text-ink-primary py-1 px-2 text-ios-footnote font-semibold transition-colors"
            >
              {AUTH_MESSAGES.skipButton}
            </button>
          </div>
          {/* Spacer allowing illustration to overlap into the canvas section */}
          <div className="h-28" />
        </div>

        {/* Mascot Showcase Card (Floating WebP Asset) */}
        <div className="absolute top-[82px] left-1/2 -translate-x-1/2 z-20">
          <div className="w-64 h-64 sm:w-72 sm:h-72 rounded-[32px] overflow-hidden shadow-2xl bg-neutral-950 border-[3px] border-subtle flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentSlide.imageSrc}
              alt={currentSlide.imageAlt}
              width={280}
              height={280}
              className="w-full h-full object-cover pointer-events-none"
            />
          </div>
        </div>
      </div>

      {/* Bottom Adaptive Section (Pagination Dots, Text, Action Button) */}
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col justify-between px-7 pt-36 pb-8 text-center z-10">
        {/* Interactive Pagination Dots (4 steps) */}
        <nav
          aria-label="Paginación del carrusel"
          className="flex justify-center items-center space-x-2.5 mb-6"
        >
          {ONBOARDING_SLIDES.map((slide, idx) => {
            const isActive = idx === slideIndex;
            return (
              <button
                key={slide.id}
                type="button"
                onClick={() => onSelectSlide(idx)}
                aria-label={`Paso ${slide.id}`}
                aria-current={isActive ? "step" : undefined}
                className={`rounded-full transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "w-2.5 h-2.5 bg-ink-primary ring-2 ring-control"
                    : "w-2 h-2 bg-control hover:bg-ink-secondary"
                }`}
              />
            );
          })}
        </nav>

        {/* Slide Title and Description */}
        <div className="space-y-3 px-1">
          <h1 className="text-ios-large-title font-extrabold text-ink-primary text-center tracking-tight leading-tight mb-3">
            {currentSlide.title}
          </h1>
          <p className="text-ios-subhead font-normal text-ink-secondary text-center leading-relaxed max-w-[290px] mx-auto min-h-[4.5rem]">
            {currentSlide.description}
          </p>
        </div>

        {/* Primary Action Button */}
        <div className="mt-8">
          <button
            type="button"
            onClick={onNext}
            className="w-full h-[54px] bg-brand-cta hover:bg-brand-cta-hover active:scale-[0.98] text-white rounded-2xl font-bold text-ios-subhead tracking-wider uppercase flex items-center justify-center space-x-2 transition-all duration-150 shadow-lg cursor-pointer"
          >
            <span>
              {isLastSlide
                ? AUTH_MESSAGES.welcomeStartButton
                : AUTH_MESSAGES.welcomeNextButton}
            </span>
            <CaretRight size={18} weight="bold" />
          </button>
        </div>
      </div>
    </main>
  );
}
