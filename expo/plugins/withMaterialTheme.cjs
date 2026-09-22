const { withAndroidStyles } = require('@expo/config-plugins');
// Material calendar/clock dialogs use the same theme family as the Compose app.
module.exports = config => withAndroidStyles(config, mod => {
 const theme = mod.modResults.resources.style.find(s => s.$.name === 'AppTheme');
 theme.$.parent = 'Theme.Material3.DayNight.NoActionBar';
 for (const [name,value] of Object.entries({ colorPrimary: '#009957', colorAccent: '#009957' })) {
   theme.item = (theme.item || []).filter(i => i.$.name !== name);
   theme.item.push({ $: { name }, _: value });
 }
 return mod;
});
