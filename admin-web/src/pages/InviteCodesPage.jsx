import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Space,
  Typography,
  Tag,
  Popconfirm,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import client from '../api/client';
import UserLink from '../components/UserLink';

const { Title } = Typography;

export default function InviteCodesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const creatorId = searchParams.get('creator_id') || '';

  const fetchInviteCodes = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (creatorId) params.creator_id = creatorId;
      const res = await client.get('/invite-codes', { params });
      setData(res.data);
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, creatorId]);

  useEffect(() => {
    fetchInviteCodes();
  }, [fetchInviteCodes]);

  const handleClearCreatorFilter = () => {
    setSearchParams({});
    setPage(1);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        creator_id: values.creator_id,
        max_uses: values.max_uses || null,
        note: values.note || null,
      };
      if (values.code) payload.code = values.code;
      if (values.expires_at) {
        payload.expires_at = values.expires_at.toISOString();
      }
      await client.post('/invite-codes', payload);
      message.success('\u9080\u8bf7\u7801\u5df2\u521b\u5efa');
      setModalOpen(false);
      form.resetFields();
      fetchInviteCodes();
    } catch (err) {
      if (err.response?.status === 409) {
        message.error('\u9080\u8bf7\u7801\u5df2\u5b58\u5728');
      } else if (err.response?.status === 404) {
        message.error('\u521b\u5efa\u8005\u7528\u6237\u4e0d\u5b58\u5728');
      } else if (err.errorFields) {
        // form validation error
      } else {
        message.error('\u521b\u5efa\u5931\u8d25');
      }
    }
  };

  const handleToggleStatus = async (record) => {
    try {
      await client.patch(`/invite-codes/${record.id}/status`, {
        is_active: !record.is_active,
      });
      message.success('状态已更新');
      fetchInviteCodes();
    } catch {
      message.error('操作失败');
    }
  };

  const handleDelete = async (record) => {
    try {
      await client.delete(`/invite-codes/${record.id}`);
      message.success('邀请码已删除');
      fetchInviteCodes();
    } catch {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: '\u9080\u8bf7\u7801',
      dataIndex: 'code',
      key: 'code',
      render: (code, record) => <Link to={`/invite-codes/${record.id}`}>{code}</Link>,
    },
    {
      title: '\u521b\u5efa\u8005',
      key: 'creator',
      render: (_, record) => (
        <UserLink userId={record.creator_id} email={record.creator_email} />
      ),
    },
    {
      title: '\u5df2\u7528/\u4e0a\u9650',
      key: 'usage',
      render: (_, record) =>
        `${record.used_count}/${record.max_uses ?? '\u221e'}`,
    },
    {
      title: '\u8fc7\u671f\u65f6\u95f4',
      dataIndex: 'expires_at',
      key: 'expires_at',
      render: (t) => (t ? new Date(t).toLocaleString('zh-CN') : '\u6c38\u4e0d\u8fc7\u671f'),
    },
    {
      title: '\u72b6\u6001',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v) => (
        <Tag color={v ? 'green' : 'default'}>
          {v ? '\u542f\u7528' : '\u7981\u7528'}
        </Tag>
      ),
    },
    {
      title: '\u5907\u6ce8',
      dataIndex: 'note',
      key: 'note',
      ellipsis: true,
    },
    {
      title: '\u521b\u5efa\u65f6\u95f4',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (t) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            onClick={() => handleToggleStatus(record)}
          >
            {record.is_active ? '禁用' : '启用'}
          </Button>
          <Popconfirm
            title="确认删除该邀请码？删除后不可恢复。"
            onConfirm={() => handleDelete(record)}
          >
            <Button type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>
            {'\u9080\u8bf7\u7801\u7ba1\u7406'}
          </Title>
          {creatorId && (
            <Tag closable onClose={handleClearCreatorFilter}>
              {`\u521b\u5efa\u8005\u7b5b\u9009: ${creatorId.slice(0, 8)}...`}
            </Tag>
          )}
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            setModalOpen(true);
          }}
        >
          {'\u521b\u5efa\u9080\u8bf7\u7801'}
        </Button>
      </Space>
      <Table
        columns={columns}
        dataSource={data.items}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total: data.total,
          showSizeChanger: true,
          showTotal: (total) => `\u5171 ${total} \u6761`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />
      <Modal
        title={'\u521b\u5efa\u9080\u8bf7\u7801'}
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="creator_id"
            label={'\u521b\u5efa\u8005 User ID'}
            rules={[{ required: true, message: '\u8bf7\u8f93\u5165\u521b\u5efa\u8005 ID' }]}
          >
            <Input placeholder="UUID of the creator user" />
          </Form.Item>
          <Form.Item name="code" label={'\u9080\u8bf7\u7801\uff08\u53ef\u9009\uff0c\u7559\u7a7a\u81ea\u52a8\u751f\u6210\uff09'}>
            <Input placeholder="CUSTOM2026" />
          </Form.Item>
          <Form.Item name="max_uses" label={'\u6700\u5927\u4f7f\u7528\u6b21\u6570'}>
            <InputNumber min={1} style={{ width: '100%' }} placeholder={'\u7559\u7a7a\u8868\u793a\u4e0d\u9650'} />
          </Form.Item>
          <Form.Item name="expires_at" label={'\u8fc7\u671f\u65f6\u95f4'}>
            <DatePicker
              showTime
              style={{ width: '100%' }}
              placeholder={'\u7559\u7a7a\u8868\u793a\u6c38\u4e0d\u8fc7\u671f'}
            />
          </Form.Item>
          <Form.Item name="note" label={'\u5907\u6ce8'}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
