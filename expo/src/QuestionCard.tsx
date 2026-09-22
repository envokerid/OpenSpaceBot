import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { answerWithoutPreamble, formatQuestionAnswers, type AskQuestion } from '../../shared/ask-question';
import { Button, ErrorNotice, Input, Label, Row, useTheme } from './ui';
import { Icon } from './Icon';

export function QuestionCard({ name, questions, settled, answered, busy, error, onAnswer }: {
  name: string; questions: AskQuestion[]; settled: boolean; answered?: string;
  busy: boolean; error?: string; onAnswer: (answer: string) => void;
}) {
  const c = useTheme();
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Record<number, string[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});
  const [other, setOther] = useState<Record<number, boolean>>({});
  const index = Math.min(active, questions.length - 1);
  const question = questions[index];
  const answers = questions.map((_, i) => [...(picked[i] ?? []).slice().sort(), ...(other[i] && custom[i]?.trim() ? [custom[i].trim()] : [])]);
  const count = answers.filter(a => a.length).length;
  const choose = (label: string) => {
    if (question.multiSelect) setPicked(v => ({ ...v, [index]: v[index]?.includes(label) ? v[index].filter(x => x !== label) : [...(v[index] ?? []), label] }));
    else {
      setPicked(v => ({ ...v, [index]: [label] })); setOther(v => ({ ...v, [index]: false }));
      const next = answers.findIndex((a, i) => i !== index && !a.length);
      if (next >= 0) setActive(next);
    }
  };
  const choice = (label: string, detail: string | undefined, checked: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole={question.multiSelect ? 'checkbox' : 'radio'} accessibilityState={{ checked, disabled: busy }} disabled={busy} onPress={onPress} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 10 }}><View style={{ width: 20, height: 20, borderRadius: question.multiSelect ? 5 : 10, borderWidth: checked ? 0 : 1.5, borderColor: c.muted, backgroundColor: checked ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{checked && (question.multiSelect ? <Icon name="check" size={14} color="#FFFFFF" /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' }} />)}</View><View style={{ flex: 1, gap: 2 }}><Label style={{ fontWeight: '500', letterSpacing: 0 }}>{label}</Label>{!!detail && <Label size={13} muted style={{ letterSpacing: 0 }}>{detail}</Label>}</View></Pressable>;
  return <View style={{ backgroundColor: c.muted + '21', borderRadius: 22, borderWidth: settled ? 0 : 1.5, borderColor: c.accent, padding: settled ? 16 : 14.5, gap: 12 }}>
    <Row style={{ flexWrap: 'nowrap' }}><Label size={16} bold style={{ flex: 1, letterSpacing: 0 }}>{name} has a question</Label>{questions.length > 1 && !settled && <Label size={12} muted>{count} of {questions.length}</Label>}</Row>
    {questions.length > 1 && <ScrollView horizontal contentContainerStyle={{ gap: 6 }}>{questions.map((q, i) => <Pressable key={i} disabled={settled} onPress={() => setActive(i)} style={{ borderRadius: 14, backgroundColor: i === index ? c.muted + '38' : 'transparent', paddingHorizontal: 10, paddingVertical: 5 }}><Row style={{ gap: 4 }}>{!!answers[i].length && <Icon name="check" size={12} color={c.accent} />}<Label size={13} bold={i === index} muted={i !== index} style={{ letterSpacing: 0 }}>{q.header || `Question ${i + 1}`}</Label></Row></Pressable>)}</ScrollView>}
    <Label selectable style={{ letterSpacing: 0 }}>{question.question}</Label>
    {settled ? <Row style={{ gap: 6, alignItems: 'flex-start', flexWrap: 'nowrap' }}><Icon name="check" size={16} color={c.muted} /><Label size={14} muted selectable style={{ flex: 1, letterSpacing: 0 }}>{answered ? answerWithoutPreamble(answered) : 'Answered'}</Label></Row> : <>
      {question.multiSelect && <Label size={12} muted>Choose all that apply</Label>}
      <View style={{ backgroundColor: c.muted + '1A', borderRadius: 14, overflow: 'hidden' }}>{question.options.map((option, i) => <React.Fragment key={option.label}>{i > 0 && <View style={{ height: 1, backgroundColor: c.line }} />}{choice(option.label, option.description, !!picked[index]?.includes(option.label), () => choose(option.label))}</React.Fragment>)}
        {!!question.options.length && <View style={{ height: 1, backgroundColor: c.line }} />}
        {choice('Other', undefined, !!other[index], () => { setOther(v => ({ ...v, [index]: !v[index] })); if (!other[index] && !question.multiSelect) setPicked(v => ({ ...v, [index]: [] })); })}
        {other[index] && <><View style={{ height: 1, backgroundColor: c.line }} /><View style={{ padding: 10 }}><Input placeholder="Type your own answer" value={custom[index] ?? ''} onChangeText={text => setCustom(v => ({ ...v, [index]: text }))} multiline editable={!busy} /></View></>}
      </View>
      <Button primary style={{ marginVertical: 4 }} title={questions.length > 1 ? 'Submit answers' : 'Submit answer'} disabled={busy || count !== questions.length} onPress={() => onAnswer(formatQuestionAnswers(questions, answers))} />
    </>}
    <ErrorNotice error={error} />
  </View>;
}
