/**
 * Utility for providing haptic feedback on supported devices
 */

// Check if vibration API is supported
const hasVibrationSupport = (): boolean => {
  return 'vibrate' in navigator || 'mozVibrate' in navigator;
};

// Patterns for different haptic feedback types
export const hapticPatterns = {
  success: [15, 30, 60], // Short, escalating pulses for successful actions
  error: [100, 50, 100], // Two longer pulses for errors
  warning: [70, 40, 70], // Medium pulses for warnings
  light: [10], // Very light feedback for subtle interactions
  medium: [40], // Medium feedback for standard interactions
  heavy: [80], // Strong feedback for important interactions
};

/**
 * Trigger haptic feedback using the specified pattern
 * @param pattern - Vibration pattern in milliseconds
 */
export const triggerHaptic = (pattern: number[]): void => {
  if (!hasVibrationSupport()) return;
  
  try {
    // TypeScript doesn't recognize mozVibrate, so we need to use this approach
    const nav = navigator as any;
    const vibrate = nav.vibrate || nav.mozVibrate;
    vibrate.call(navigator, pattern);
  } catch (error) {
    console.debug('Haptic feedback failed:', error);
  }
};

/**
 * Trigger success haptic feedback
 */
export const successHaptic = (): void => {
  triggerHaptic(hapticPatterns.success);
};

/**
 * Trigger error haptic feedback
 */
export const errorHaptic = (): void => {
  triggerHaptic(hapticPatterns.error);
};
