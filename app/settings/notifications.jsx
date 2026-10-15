import SettingsInfoPage from '../../components/SettingsInfoPage';

const sections = [
  {
    title: 'Stay in the loop',
    items: [
      {
        icon: 'weather-cloudy',
        title: 'Trail conditions',
        description:
          'Keep an eye out for changing weather and trail updates before heading out.',
      },
      {
        icon: 'calendar-check-outline',
        title: 'Hike reminders',
        description:
          'A little planning goes a long way. Check your route, gear, and start time before each hike.',
      },
      {
        icon: 'account-group-outline',
        title: 'Community updates',
        description:
          'Discover trail tips and stories shared by fellow outdoor explorers.',
      },
    ],
  },
];

export default function NotificationsPage() {
  return (
    <SettingsInfoPage
      title="Notifications"
      subtitle="Helpful reminders for safer, more enjoyable days on the trail."
      icon="bell-outline"
      sections={sections}
      footer="These notification details are informational. App notifications are not configured yet."
    />
  );
}
