import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthFlow } from "./AuthFlow";
import { AUTH_MESSAGES, ONBOARDING_SLIDES } from "@/lib/auth-messages";

describe("AuthFlow Component", () => {
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Onboarding step 1 initially with CampusUNSA title and SIGUIENTE button", () => {
    render(<AuthFlow onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

    expect(screen.getByRole("heading", { name: ONBOARDING_SLIDES[0].title, level: 1 })).toBeDefined();
    expect(screen.getByText(ONBOARDING_SLIDES[0].description)).toBeDefined();
    expect(screen.getByAltText(ONBOARDING_SLIDES[0].imageAlt)).toBeDefined();
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeDefined();
  });

  it("advances sequentially through all 4 onboarding steps and navigates to login on step 4 CTA", () => {
    render(<AuthFlow onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

    // Step 1 -> Step 2
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByRole("heading", { name: ONBOARDING_SLIDES[1].title, level: 1 })).toBeDefined();
    expect(screen.getByText(ONBOARDING_SLIDES[1].description)).toBeDefined();

    // Step 2 -> Step 3
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByRole("heading", { name: ONBOARDING_SLIDES[2].title, level: 1 })).toBeDefined();
    expect(screen.getByText(ONBOARDING_SLIDES[2].description)).toBeDefined();

    // Step 3 -> Step 4
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByRole("heading", { name: ONBOARDING_SLIDES[3].title, level: 1 })).toBeDefined();
    expect(screen.getByRole("button", { name: /comenzar/i })).toBeDefined();

    // Step 4 -> Login card
    fireEvent.click(screen.getByRole("button", { name: /comenzar/i }));
    expect(screen.getByText(AUTH_MESSAGES.signInGreeting)).toBeDefined();
    expect(screen.getByPlaceholderText(AUTH_MESSAGES.emailPlaceholder)).toBeDefined();
    expect(screen.getByPlaceholderText(AUTH_MESSAGES.passwordPlaceholder)).toBeDefined();
    expect(screen.getByText(AUTH_MESSAGES.googleButton)).toBeDefined();
  });

  it("navigates directly between onboarding steps via pagination dots and supports skip button", () => {
    render(<AuthFlow onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

    // Click Dot for Step 3 directly
    const dotStep3 = screen.getByLabelText("Paso 3");
    fireEvent.click(dotStep3);
    expect(screen.getByRole("heading", { name: ONBOARDING_SLIDES[2].title, level: 1 })).toBeDefined();

    // Click Saltar to go straight to login
    const skipBtn = screen.getByRole("button", { name: AUTH_MESSAGES.skipButton });
    fireEvent.click(skipBtn);
    expect(screen.getByText(AUTH_MESSAGES.signInGreeting)).toBeDefined();
  });

  it("navigates back to Onboarding step 4 when Atras is clicked on SignIn card", () => {
    render(<AuthFlow onSuccess={mockOnSuccess} onCancel={mockOnCancel} initialStep="auth" />);

    expect(screen.getByText(AUTH_MESSAGES.signInGreeting)).toBeDefined();
    fireEvent.click(screen.getByText(AUTH_MESSAGES.backButton));
    expect(screen.getByRole("heading", { name: ONBOARDING_SLIDES[3].title, level: 1 })).toBeDefined();
  });

  it("toggles between Sign In and Sign Up modes cleanly in reference card", () => {
    render(<AuthFlow onSuccess={mockOnSuccess} initialStep="auth" />);

    expect(screen.getByText(AUTH_MESSAGES.signInGreeting)).toBeDefined();
    expect(screen.queryByPlaceholderText(AUTH_MESSAGES.fullNamePlaceholder)).toBeNull();

    // Toggle to Sign Up
    fireEvent.click(screen.getByText(AUTH_MESSAGES.switchToSignUpAction));
    expect(screen.getByText(AUTH_MESSAGES.signUpGreeting)).toBeDefined();
    expect(screen.getByPlaceholderText(AUTH_MESSAGES.fullNamePlaceholder)).toBeDefined();

    // Toggle back to Sign In
    fireEvent.click(screen.getByText(AUTH_MESSAGES.switchToSignInAction));
    expect(screen.getByText(AUTH_MESSAGES.signInGreeting)).toBeDefined();
    expect(screen.queryByPlaceholderText(AUTH_MESSAGES.fullNamePlaceholder)).toBeNull();
  });

  it("validates that email ends with @unsa.edu.pe", async () => {
    render(<AuthFlow onSuccess={mockOnSuccess} initialStep="auth" />);

    const emailInput = screen.getByPlaceholderText(AUTH_MESSAGES.emailPlaceholder);
    const passwordInput = screen.getByPlaceholderText(AUTH_MESSAGES.passwordPlaceholder);
    const submitBtn = screen.getByRole("button", { name: AUTH_MESSAGES.signInSubmit });

    fireEvent.change(emailInput, { target: { value: "estudiante@gmail.com" } });
    fireEvent.change(passwordInput, { target: { value: "secreta123" } });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(AUTH_MESSAGES.invalidDomainError)).toBeDefined();
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it("authenticates institutional user and triggers onSuccess with token", async () => {
    const mockAuthResponse = {
      access_token: "jwt-mock-test-token-12345",
      token_type: "bearer",
      user: {
        id: "usr-mock-1",
        email: "mmarquezhe@unsa.edu.pe",
        role: "student",
        full_name: "Marco Marquez",
      },
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockAuthResponse,
    });

    render(<AuthFlow onSuccess={mockOnSuccess} initialStep="auth" />);

    const emailInput = screen.getByPlaceholderText(AUTH_MESSAGES.emailPlaceholder);
    const passwordInput = screen.getByPlaceholderText(AUTH_MESSAGES.passwordPlaceholder);
    const submitBtn = screen.getByRole("button", { name: AUTH_MESSAGES.signInSubmit });

    fireEvent.change(emailInput, { target: { value: "mmarquezhe@unsa.edu.pe" } });
    fireEvent.change(passwordInput, { target: { value: "Seguridad2026!" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith("jwt-mock-test-token-12345", mockAuthResponse.user);
    });
    expect(localStorage.getItem("campusunsa_token")).toBe("jwt-mock-test-token-12345");
  });
});
