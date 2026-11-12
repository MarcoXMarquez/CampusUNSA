import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthFlow } from "./AuthFlow";
import { AUTH_MESSAGES } from "@/lib/auth-messages";

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

  it("renders WelcomeScreen initially with CampusUNSA badge and Siguiente button", () => {
    render(<AuthFlow onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

    expect(screen.getByText(AUTH_MESSAGES.welcomeBadge)).toBeDefined();
    expect(screen.getByText(AUTH_MESSAGES.welcomeTitle)).toBeDefined();
    expect(screen.getByText(AUTH_MESSAGES.welcomeSubtitle)).toBeDefined();
    expect(screen.getByText(AUTH_MESSAGES.welcomeFeature1Title)).toBeDefined();
    expect(screen.getByText(AUTH_MESSAGES.welcomeNextButton)).toBeDefined();
  });

  it("navigates to SignInScreen when Siguiente is clicked", () => {
    render(<AuthFlow onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

    fireEvent.click(screen.getByText(AUTH_MESSAGES.welcomeNextButton));

    expect(
      screen.getByRole("heading", { name: AUTH_MESSAGES.signInTitle, level: 2 })
    ).toBeDefined();
    expect(screen.getByPlaceholderText(AUTH_MESSAGES.emailPlaceholder)).toBeDefined();
    expect(screen.getByPlaceholderText(AUTH_MESSAGES.passwordPlaceholder)).toBeDefined();
    expect(screen.getByText(AUTH_MESSAGES.googleButton)).toBeDefined();
  });

  it("navigates back to WelcomeScreen when Atras is clicked", () => {
    render(<AuthFlow onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

    fireEvent.click(screen.getByText(AUTH_MESSAGES.welcomeNextButton));
    expect(
      screen.getByRole("heading", { name: AUTH_MESSAGES.signInTitle, level: 2 })
    ).toBeDefined();

    fireEvent.click(screen.getByText(AUTH_MESSAGES.backButton));
    expect(screen.getByText(AUTH_MESSAGES.welcomeTitle)).toBeDefined();
  });

  it("toggles between Sign In and Sign Up modes cleanly", () => {
    render(<AuthFlow onSuccess={mockOnSuccess} initialStep="auth" />);

    expect(
      screen.getByRole("heading", { name: AUTH_MESSAGES.signInTitle, level: 2 })
    ).toBeDefined();
    expect(screen.queryByPlaceholderText(AUTH_MESSAGES.fullNamePlaceholder)).toBeNull();

    // Toggle to Sign Up
    fireEvent.click(screen.getByText(AUTH_MESSAGES.switchToSignUpAction));
    expect(
      screen.getByRole("heading", { name: AUTH_MESSAGES.signUpTitle, level: 2 })
    ).toBeDefined();
    expect(screen.getByPlaceholderText(AUTH_MESSAGES.fullNamePlaceholder)).toBeDefined();

    // Toggle back to Sign In
    fireEvent.click(screen.getByText(AUTH_MESSAGES.switchToSignInAction));
    expect(
      screen.getByRole("heading", { name: AUTH_MESSAGES.signInTitle, level: 2 })
    ).toBeDefined();
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

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAuthResponse,
    });

    render(<AuthFlow onSuccess={mockOnSuccess} initialStep="auth" />);

    const emailInput = screen.getByPlaceholderText(AUTH_MESSAGES.emailPlaceholder);
    const passwordInput = screen.getByPlaceholderText(AUTH_MESSAGES.passwordPlaceholder);
    const submitBtn = screen.getByRole("button", { name: AUTH_MESSAGES.signInSubmit });

    fireEvent.change(emailInput, { target: { value: "mmarquezhe@unsa.edu.pe" } });
    fireEvent.change(passwordInput, { target: { value: "passwordSeguro123" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith(
        mockAuthResponse.access_token,
        mockAuthResponse.user
      );
    });

    expect(localStorage.getItem("campusunsa_token")).toBe(mockAuthResponse.access_token);
  });
});
