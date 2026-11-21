import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, fontSize, shadow } from '../theme';
import { isoDate, parseIsoDate } from '../utils/dateRange';

interface CalendarModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectDate: (date: string) => void;
  selectedDate?: string;
  title?: string;
  minDate?: string;
  maxDate?: string;
  quickPresets?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const CalendarModal: React.FC<CalendarModalProps> = ({
  visible,
  onClose,
  onSelectDate,
  selectedDate,
  title = 'Select Date',
  minDate,
  maxDate,
  quickPresets = true,
}) => {
  const todayStr = useMemo(() => isoDate(new Date()), []);

  // Determine initial year and month
  const initialDateObj = useMemo(() => {
    if (selectedDate) {
      const parsed = parseIsoDate(selectedDate);
      if (parsed) return parsed;
    }
    return new Date();
  }, [selectedDate]);

  const [viewYear, setViewYear] = useState<number>(initialDateObj.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDateObj.getMonth());
  const [tempSelected, setTempSelected] = useState<string>(selectedDate || todayStr);
  const [showYearMonthPicker, setShowYearMonthPicker] = useState<boolean>(false);

  // Sync state whenever modal opens or selectedDate changes
  useEffect(() => {
    if (visible) {
      const d = selectedDate ? (parseIsoDate(selectedDate) || new Date()) : new Date();
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setTempSelected(selectedDate || todayStr);
      setShowYearMonthPicker(false);
    }
  }, [visible, selectedDate, todayStr]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  // Generate calendar grid
  const daysGrid = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{
      day: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isDisabled: boolean;
    }> = [];

    // Leading days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({
        day,
        dateStr,
        isCurrentMonth: false,
        isDisabled: true,
      });
    }

    // Days in current month
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      let isDisabled = false;
      if (minDate && dateStr < minDate) isDisabled = true;
      if (maxDate && dateStr > maxDate) isDisabled = true;

      cells.push({
        day,
        dateStr,
        isCurrentMonth: true,
        isDisabled,
      });
    }

    // Trailing days to fill the row (multiples of 7)
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({
        day,
        dateStr,
        isCurrentMonth: false,
        isDisabled: true,
      });
    }

    return cells;
  }, [viewYear, viewMonth, minDate, maxDate]);

  const handleDayPress = (dateStr: string, isDisabled: boolean) => {
    if (isDisabled) return;
    setTempSelected(dateStr);
  };

  const handleApply = () => {
    onSelectDate(tempSelected);
    onClose();
  };

  const handleQuickPreset = (preset: 'today' | 'yesterday' | 'startOfMonth' | 'startOfWeek') => {
    const now = new Date();
    let target = new Date();

    if (preset === 'today') {
      target = now;
    } else if (preset === 'yesterday') {
      target.setDate(now.getDate() - 1);
    } else if (preset === 'startOfMonth') {
      target = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === 'startOfWeek') {
      const dayFromMonday = (now.getDay() + 6) % 7;
      target.setDate(now.getDate() - dayFromMonday);
    }

    const iso = isoDate(target);
    setTempSelected(iso);
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
  };

  // Range of selectable years in quick picker (current - 6 to current + 3)
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentYear - 5; y <= currentYear + 3; y++) {
      years.push(y);
    }
    return years;
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.card}>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerTitleWrap}>
                  <Ionicons name="calendar" size={20} color={colors.primary} />
                  <Text style={styles.headerTitle}>{title}</Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Close calendar"
                >
                  <Ionicons name="close" size={22} color={colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Quick Presets */}
              {quickPresets && (
                <View style={styles.presetsRow}>
                  <TouchableOpacity
                    style={[styles.presetChip, tempSelected === todayStr && styles.presetChipActive]}
                    onPress={() => handleQuickPreset('today')}
                  >
                    <Text style={[styles.presetText, tempSelected === todayStr && styles.presetTextActive]}>
                      Today
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.presetChip}
                    onPress={() => handleQuickPreset('yesterday')}
                  >
                    <Text style={styles.presetText}>Yesterday</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.presetChip}
                    onPress={() => handleQuickPreset('startOfWeek')}
                  >
                    <Text style={styles.presetText}>Start of Week</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.presetChip}
                    onPress={() => handleQuickPreset('startOfMonth')}
                  >
                    <Text style={styles.presetText}>1st of Month</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Month & Year Navigation */}
              <View style={styles.monthNav}>
                <TouchableOpacity
                  onPress={prevMonth}
                  style={styles.navBtn}
                  accessibilityLabel="Previous month"
                >
                  <Ionicons name="chevron-back" size={20} color={colors.ink} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setShowYearMonthPicker(!showYearMonthPicker)}
                  style={styles.monthTitleBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.monthTitleText}>
                    {MONTH_NAMES[viewMonth]} {viewYear}
                  </Text>
                  <Ionicons
                    name={showYearMonthPicker ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.primary}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={nextMonth}
                  style={styles.navBtn}
                  accessibilityLabel="Next month"
                >
                  <Ionicons name="chevron-forward" size={20} color={colors.ink} />
                </TouchableOpacity>
              </View>

              {/* Month / Year Quick Dropdown Picker */}
              {showYearMonthPicker ? (
                <View style={styles.quickPickerWrap}>
                  <Text style={styles.pickerSectionHeader}>Select Month</Text>
                  <View style={styles.monthsGrid}>
                    {MONTH_NAMES.map((m, idx) => {
                      const isCurr = idx === viewMonth;
                      return (
                        <TouchableOpacity
                          key={m}
                          style={[styles.monthPill, isCurr && styles.monthPillActive]}
                          onPress={() => {
                            setViewMonth(idx);
                            setShowYearMonthPicker(false);
                          }}
                        >
                          <Text style={[styles.monthPillText, isCurr && styles.monthPillTextActive]}>
                            {m.slice(0, 3)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[styles.pickerSectionHeader, { marginTop: 12 }]}>Select Year</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearsRow}>
                    {availableYears.map(yr => {
                      const isCurr = yr === viewYear;
                      return (
                        <TouchableOpacity
                          key={yr}
                          style={[styles.yearPill, isCurr && styles.yearPillActive]}
                          onPress={() => {
                            setViewYear(yr);
                            setShowYearMonthPicker(false);
                          }}
                        >
                          <Text style={[styles.yearPillText, isCurr && styles.yearPillTextActive]}>
                            {yr}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : (
                <>
                  {/* Weekday Labels */}
                  <View style={styles.weekdayRow}>
                    {WEEK_DAYS.map((wd, i) => (
                      <View key={i} style={styles.weekdayCell}>
                        <Text style={[styles.weekdayText, (i === 0 || i === 6) && styles.weekendText]}>
                          {wd}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Day Grid */}
                  <View style={styles.grid}>
                    {daysGrid.map((item, index) => {
                      const isSelected = item.dateStr === tempSelected && item.isCurrentMonth;
                      const isToday = item.dateStr === todayStr && item.isCurrentMonth;

                      return (
                        <View key={`${item.dateStr}_${index}`} style={styles.cellWrap}>
                          {item.isCurrentMonth ? (
                            <TouchableOpacity
                              style={[
                                styles.dayBtn,
                                isToday && !isSelected && styles.todayBtn,
                                isSelected && styles.selectedBtn,
                                item.isDisabled && styles.disabledBtn,
                              ]}
                              onPress={() => handleDayPress(item.dateStr, item.isDisabled)}
                              disabled={item.isDisabled}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.dayText,
                                  isToday && !isSelected && styles.todayText,
                                  isSelected && styles.selectedText,
                                  item.isDisabled && styles.disabledText,
                                ]}
                              >
                                {item.day}
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.dayBtn}>
                              <Text style={styles.outsideMonthText}>{item.day}</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Selected date preview and action buttons */}
              <View style={styles.footer}>
                <View style={styles.selectedDisplay}>
                  <Text style={styles.selectedDisplayLabel}>Chosen date:</Text>
                  <Text style={styles.selectedDisplayVal}>{tempSelected}</Text>
                </View>
                <View style={styles.footerActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={onClose}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.applyBtn}
                    onPress={handleApply}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-circle-outline" size={17} color={colors.white} />
                    <Text style={styles.applyBtnText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 31, 68, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    ...shadow.float,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
    paddingBottom: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.ink,
  },
  closeBtn: {
    padding: 4,
    borderRadius: radius.pill,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: space.sm,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.line,
  },
  presetChipActive: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.primary,
  },
  presetText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  presetTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
    marginBottom: space.md,
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  monthTitleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  monthTitleText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.ink,
  },
  quickPickerWrap: {
    paddingVertical: space.sm,
  },
  pickerSectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  monthPill: {
    width: '23%',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
  monthPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  monthPillText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.ink,
  },
  monthPillTextActive: {
    color: colors.white,
    fontWeight: '800',
  },
  yearsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  yearPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
  yearPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  yearPillText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.ink,
  },
  yearPillTextActive: {
    color: colors.white,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  weekdayText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.muted,
  },
  weekendText: {
    color: colors.primaryDark,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cellWrap: {
    width: '14.285%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  dayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  selectedBtn: {
    backgroundColor: colors.primary,
    ...shadow.card,
  },
  disabledBtn: {
    opacity: 0.3,
  },
  dayText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.ink,
  },
  todayText: {
    color: colors.primaryDark,
    fontWeight: '800',
  },
  selectedText: {
    color: colors.white,
    fontWeight: '800',
  },
  outsideMonthText: {
    fontSize: fontSize.sm,
    color: colors.disabled,
  },
  disabledText: {
    color: colors.disabled,
  },
  footer: {
    marginTop: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  selectedDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.sm,
    marginBottom: space.md,
  },
  selectedDisplayLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.muted,
  },
  selectedDisplayVal: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.primary,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.muted,
  },
  applyBtn: {
    flex: 2,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...shadow.card,
  },
  applyBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.white,
  },
});
